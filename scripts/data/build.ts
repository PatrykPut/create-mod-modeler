// Builds src/data/create-6.0.10.json and public/textures/** from pinned upstream sources.
// Usage: npm run data   (sources are cached in .cache/sources; delete it to re-download)
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from 'playwright'
import { MACHINE_BLOCKS } from '../../src/core/blocks.ts'
import type { GameData, ItemInfo, Recipe } from '../../src/data/types.ts'
import {
  bucketRecipes,
  createNormalizer,
  type Normalizer,
} from './normalize.ts'
import { iconTexture } from './models.ts'
import {
  elementPolygons,
  objPolygons,
  rasterize,
  resolveModel,
  type Model,
  type Texture,
} from './render.ts'
import { runtimeRecipes } from './runtime.ts'
import { TagIndex, type TagKind } from './tags.ts'

const CREATE_VERSION = '6.0.10'
const MINECRAFT_VERSION = '1.21.1'
const CREATE_TAG = `mc${MINECRAFT_VERSION}-${CREATE_VERSION}`

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const cache = join(root, '.cache', 'sources')
const outFile = join(root, 'src', 'data', `create-${CREATE_VERSION}.json`)
const textureDir = join(root, 'public', 'textures')

interface Source {
  dir: string
  repo: string
  ref: string
  paths: string[]
}

const sources = {
  create: {
    dir: join(cache, `create-${CREATE_TAG}`),
    repo: 'https://github.com/Creators-of-Create/Create.git',
    ref: CREATE_TAG,
    paths: [
      'src/generated/resources/data/create/recipe/',
      'src/generated/resources/data/*/tags/item/',
      'src/generated/resources/data/*/tags/fluid/',
      'src/generated/resources/assets/create/lang/en_us.json',
      'src/main/resources/assets/create/textures/item/',
      'src/main/resources/assets/create/textures/block/',
      'src/main/resources/assets/create/models/',
      'src/generated/resources/assets/create/models/',
    ],
  },
  vanillaData: {
    dir: join(cache, `mcmeta-${MINECRAFT_VERSION}-data-json`),
    repo: 'https://github.com/misode/mcmeta.git',
    ref: `${MINECRAFT_VERSION}-data-json`,
    paths: [
      'data/minecraft/recipe/',
      'data/minecraft/tags/item/',
      'data/minecraft/tags/fluid/',
    ],
  },
  // `c:` convention tags (Create's recipes use e.g. #c:ingots/iron)
  neoforge: {
    dir: join(cache, `neoforge-${MINECRAFT_VERSION}`),
    repo: 'https://github.com/neoforged/NeoForge.git',
    ref: MINECRAFT_VERSION,
    paths: [
      'src/generated/resources/data/c/tags/item/',
      'src/generated/resources/data/c/tags/fluid/',
    ],
  },
  vanillaLang: {
    dir: join(cache, `mcmeta-${MINECRAFT_VERSION}-assets-json`),
    repo: 'https://github.com/misode/mcmeta.git',
    ref: `${MINECRAFT_VERSION}-assets-json`,
    paths: ['assets/minecraft/lang/en_us.json', 'assets/minecraft/models/'],
  },
  vanillaTextures: {
    dir: join(cache, `mcmeta-${MINECRAFT_VERSION}-assets`),
    repo: 'https://github.com/misode/mcmeta.git',
    ref: `${MINECRAFT_VERSION}-assets`,
    paths: [
      'assets/minecraft/textures/item/',
      'assets/minecraft/textures/block/',
    ],
  },
} satisfies Record<string, Source>

function git(cwd: string, ...args: string[]) {
  // HTTP/1.1: large blob fetches over HTTP/2 fail with "RPC failed; curl 16"
  execFileSync('git', ['-c', 'http.version=HTTP/1.1', ...args], {
    cwd,
    stdio: 'inherit',
  })
}

function fetchSource({ dir, repo, ref, paths }: Source) {
  if (!existsSync(dir)) {
    console.log(`Fetching ${repo} @ ${ref}`)
    mkdirSync(dirname(dir), { recursive: true })
    git(
      dirname(dir),
      'clone',
      '--quiet',
      '--depth=1',
      `--branch=${ref}`,
      '--filter=blob:none',
      '--sparse',
      repo,
      dir,
    )
  }
  // also run for cached clones, so new paths get checked out
  git(dir, 'sparse-checkout', 'set', '--no-cone', ...paths.map((p) => `/${p}`))
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** All *.json files below dir, as [path relative to dir without extension, absolute path]. */
function jsonFiles(dir: string): [string, string][] {
  const result: [string, string][] = []
  for (const entry of readdirSync(dir, {
    withFileTypes: true,
    recursive: true,
  })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const path = join(entry.parentPath, entry.name)
    result.push([relative(dir, path).replaceAll('\\', '/').slice(0, -5), path])
  }
  return result.sort(([a], [b]) => a.localeCompare(b))
}

/** Tags of the namespaces we model; files below `<root>/<namespace>/tags/<kind>/`. */
function collectTags(): TagIndex {
  const tags = new TagIndex((id) => /^(minecraft|create):/.test(id))
  const roots = [
    join(sources.vanillaData.dir, 'data'),
    join(sources.neoforge.dir, 'src/generated/resources/data'),
    join(sources.create.dir, 'src/generated/resources/data'),
  ]
  for (const root of roots) {
    for (const namespace of readdirSync(root)) {
      for (const kind of ['item', 'fluid'] satisfies TagKind[]) {
        const dir = join(root, namespace, 'tags', kind)
        if (!existsSync(dir)) continue
        for (const [name, path] of jsonFiles(dir))
          tags.add(kind, `${namespace}:${name}`, readJson(path))
      }
    }
  }
  return tags
}

function collectRecipes(normalizer: Normalizer, lang: Lang): Recipe[] {
  const recipes: Recipe[] = []
  let skipped = 0

  const createDir = join(
    sources.create.dir,
    'src/generated/resources/data/create/recipe',
  )
  for (const [name, path] of jsonFiles(createDir)) {
    const raw = readJson(path)
    // Create's own crafting, stonecutting and smelting recipes
    if (String(raw.type).startsWith('minecraft:')) {
      recipes.push(...normalizer.vanillaRecipes(`create:${name}`, raw))
      continue
    }
    const recipe = normalizer.createRecipe(`create:${name}`, raw)
    if (recipe) recipes.push(recipe)
    else if (/^create:(?!sequenced_assembly)/.test(String(raw.type))) skipped++
  }

  const vanillaDir = join(sources.vanillaData.dir, 'data/minecraft/recipe')
  for (const [name, path] of jsonFiles(vanillaDir))
    recipes.push(
      ...normalizer.vanillaRecipes(`minecraft:${name}`, readJson(path)),
    )

  // item registry, approximated by the item and block names in the language files
  const registry = new Set(
    Object.keys(lang).flatMap((key) => {
      const match = /^(?:item|block)\.(minecraft|create)\.([a-z0-9_]+)$/.exec(
        key,
      )
      return match ? [`${match[1]}:${match[2]}`] : []
    }),
  )
  recipes.push(...runtimeRecipes(registry))

  const fluids = new Set<string>()
  for (const recipe of recipes)
    for (const { item } of [...recipe.inputs, ...recipe.outputs])
      if (item.startsWith('fluid:') && !item.includes('#'))
        fluids.add(item.slice(6))
  for (const fluid of [...fluids].sort()) {
    const [namespace, path] = fluid.split(':')
    if (lang[`item.${namespace}.${path}_bucket`])
      recipes.push(...bucketRecipes(fluid, `${namespace}:${path}_bucket`))
  }

  console.log(
    `${recipes.length} recipes (skipped ${skipped} Create recipes: mod compat or unsupported ingredients)`,
  )
  return recipes
}

type Lang = Record<string, string>

function readLang(): Lang {
  return {
    ...readJson(
      join(sources.vanillaLang.dir, 'assets/minecraft/lang/en_us.json'),
    ),
    ...readJson(
      join(
        sources.create.dir,
        'src/generated/resources/assets/create/lang/en_us.json',
      ),
    ),
  } as Lang
}

function titleCase(path: string) {
  return path.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Model JSON files for an id such as "create:block/millstone/item", most specific first. */
const modelFiles = (namespace: string, path: string) =>
  namespace === 'create'
    ? ['generated', 'main'].map((set) =>
        join(
          sources.create.dir,
          `src/${set}/resources/assets/create/models/${path}.json`,
        ),
      )
    : [join(sources.vanillaLang.dir, `assets/${namespace}/models/${path}.json`)]
const readModel = (id: string) => {
  const [namespace, path] = id.split(':')
  const file = modelFiles(namespace, path).find(existsSync)
  return file ? (readJson(file) as Model) : undefined
}
const textureFile = (texture: string) => {
  const [namespace, path] = texture.split(':')
  return namespace === 'create'
    ? join(
        sources.create.dir,
        `src/main/resources/assets/create/textures/${path}.png`,
      )
    : join(
        sources.vanillaTextures.dir,
        `assets/${namespace}/textures/${path}.png`,
      )
}

const MAX_LISTED_MEMBERS = 3

function collectItems(
  recipes: Recipe[],
  normalizer: Normalizer,
  lang: Lang,
): Record<string, ItemInfo> {
  const ids = new Set<string>()
  for (const recipe of recipes) {
    for (const { item } of [...recipe.inputs, ...recipe.outputs]) ids.add(item)
    if (recipe.tool) ids.add(recipe.tool)
  }
  for (const id of [...ids])
    for (const member of normalizer.tags.get(id) ?? []) ids.add(member)
  // named like any item; renderIcons draws their icons
  const machineBlocks = new Set<string>(MACHINE_BLOCKS)
  for (const block of machineBlocks) ids.add(block)

  rmSync(textureDir, { recursive: true, force: true })
  const items: Record<string, ItemInfo> = {}

  /** Copies the texture that best shows the item and returns its icon path. */
  function icon(namespace: string, path: string): string | undefined {
    const texture = [
      `${namespace}:item/${path}`,
      `${namespace}:block/${path}`,
      iconTexture(`${namespace}:${path}`, readModel),
    ]
      .filter((t) => t !== undefined)
      .map(textureFile)
      .find(existsSync)
    if (!texture) return undefined
    const target = join(textureDir, namespace, `${path}.png`)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(texture, target)
    return `textures/${namespace}/${path}.png`
  }

  const sorted = [...ids].sort()
  // plain items and fluids first: tag names and icons are built from their members
  for (const id of sorted.filter((id) => !id.includes('#'))) {
    const fluid = id.startsWith('fluid:')
    const [namespace, path] = (fluid ? id.slice(6) : id).split(':')
    const name = fluid
      ? (lang[`fluid.${namespace}.${path}`] ??
        lang[`block.${namespace}.${path}`] ??
        titleCase(path))
      : (lang[`item.${namespace}.${path}`] ??
        lang[`block.${namespace}.${path}`] ??
        titleCase(path))
    const item: ItemInfo = { id, name }
    const iconPath = machineBlocks.has(id)
      ? undefined
      : icon(namespace, fluid ? `${path}_bucket` : path)
    if (iconPath) item.icon = iconPath
    items[id] = item
  }
  for (const id of sorted.filter((id) => id.includes('#'))) {
    const members = normalizer.tags.get(id) ?? []
    const names = members.map((member) => items[member].name)
    let name: string
    if (names.length <= MAX_LISTED_MEMBERS) name = names.join(' / ')
    else if (normalizer.syntheticTags.has(id))
      name = `${names[0]} (or ${names.length - 1} others)`
    else name = `${titleCase(id.split(/[:/]/).at(-1)!)} (any)`
    const item: ItemInfo = { id, name }
    const iconPath = items[members[0]]?.icon
    if (iconPath) item.icon = iconPath
    items[id] = item
  }

  const withoutIcon = Object.values(items).filter(
    (i) => !i.icon && !machineBlocks.has(i.id),
  ).length
  console.log(
    `${sorted.length} items, fluids and tags (${withoutIcon} without icon)`,
  )
  return items
}

const ICON_SIZE = 64

/** Decodes a PNG file to RGBA in the browser. */
function decodePng(page: Page, file: string): Promise<Texture> {
  const url = `data:image/png;base64,${readFileSync(file).toString('base64')}`
  return page.evaluate(async (url) => {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = new OffscreenCanvas(image.width, image.height)
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, image.width, image.height)
    return { width: image.width, height: image.height, data: Array.from(data) }
  }, url)
}

/** Encodes square RGBA pixels as PNG in the browser. */
async function encodePng(page: Page, pixels: Uint8ClampedArray, size: number) {
  const base64 = await page.evaluate(
    async ({ data, size }) => {
      const canvas = new OffscreenCanvas(size, size)
      const image = new ImageData(new Uint8ClampedArray(data), size, size)
      canvas.getContext('2d')!.putImageData(image, 0, 0)
      const bytes = new Uint8Array(
        await (await canvas.convertToBlob()).arrayBuffer(),
      )
      return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    },
    { data: Array.from(pixels), size },
  )
  return Buffer.from(base64, 'base64')
}

/** Renders the machine blocks' item models into isometric icons (Chromium does the PNG I/O). */
async function renderIcons(items: Record<string, ItemInfo>) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const textures = new Map<string, Texture>()
    for (const block of MACHINE_BLOCKS) {
      const model = resolveModel(block, readModel)
      if (!model) throw new Error(`${block}: no 3D item model`)
      let polygons
      if (model.obj) {
        // "create:models/block/x.obj" lives under assets/create/
        const [namespace, path] = model.obj.model.split(':')
        const objFile = join(
          sources.create.dir,
          `src/main/resources/assets/${namespace}/${path}`,
        )
        const obj = readFileSync(objFile, 'utf8')
        const mtlName = /^mtllib\s+(\S+)/m.exec(obj)?.[1] ?? ''
        const mtl = readFileSync(join(dirname(objFile), mtlName), 'utf8')
        polygons = objPolygons(obj, mtl, model.textures, model.obj.flipV)
      } else {
        polygons = elementPolygons(model.elements!, model.textures)
      }
      for (const { texture } of polygons) {
        if (textures.has(texture)) continue
        const file = textureFile(texture)
        if (!existsSync(file))
          throw new Error(`${block}: no texture ${texture}`)
        textures.set(texture, await decodePng(page, file))
      }
      const pixels = rasterize(polygons, model.gui, textures, ICON_SIZE)
      const [namespace, path] = block.split(':')
      const target = join(textureDir, 'rendered', namespace, `${path}.png`)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, await encodePng(page, pixels, ICON_SIZE))
      items[block].icon = `textures/rendered/${namespace}/${path}.png`
      items[block].rendered = true
    }
    console.log(`Rendered ${MACHINE_BLOCKS.length} machine icons`)
  } finally {
    await browser.close()
  }
}

async function main() {
  for (const source of Object.values(sources)) fetchSource(source)

  const lang = readLang()
  const normalizer = createNormalizer(collectTags())
  const recipes = collectRecipes(normalizer, lang)
  const items = collectItems(recipes, normalizer, lang)
  await renderIcons(items)
  const tags = Object.fromEntries(
    [...normalizer.tags].sort(([a], [b]) => a.localeCompare(b)),
  )
  const data: GameData = {
    meta: {
      create: CREATE_VERSION,
      minecraft: MINECRAFT_VERSION,
      createTag: CREATE_TAG,
    },
    items,
    tags,
    recipes,
  }
  writeFileSync(outFile, JSON.stringify(data, null, 1) + '\n')
  writeFileSync(
    join(textureDir, 'NOTICE.md'),
    [
      '# Textures',
      '',
      "Copied by `scripts/data/build.ts`. Not covered by this project's MIT license.",
      '',
      `- \`create/\`: © The Create Team / The Creators of Create, from ${sources.create.repo} @ ${CREATE_TAG} (all rights reserved).`,
      `- \`minecraft/\`: © Mojang AB / Microsoft, via ${sources.vanillaTextures.repo} @ ${sources.vanillaTextures.ref}.`,
      '- `rendered/`: isometric icons rendered from the models and textures above; same owners.',
      '',
    ].join('\n'),
  )
  console.log(`Wrote ${relative(root, outFile)}`)
}

await main()
