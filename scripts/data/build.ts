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
import type { GameData, ItemInfo, Recipe } from '../../src/data/types.ts'
import {
  deriveCompacting,
  isSupportedCreateType,
  normalizeCreateRecipe,
} from './normalize.ts'

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
      'src/generated/resources/assets/create/lang/en_us.json',
      'src/main/resources/assets/create/textures/item/',
      'src/main/resources/assets/create/textures/block/',
    ],
  },
  vanillaData: {
    dir: join(cache, `mcmeta-${MINECRAFT_VERSION}-data-json`),
    repo: 'https://github.com/misode/mcmeta.git',
    ref: `${MINECRAFT_VERSION}-data-json`,
    paths: ['data/minecraft/recipe/'],
  },
  vanillaLang: {
    dir: join(cache, `mcmeta-${MINECRAFT_VERSION}-assets-json`),
    repo: 'https://github.com/misode/mcmeta.git',
    ref: `${MINECRAFT_VERSION}-assets-json`,
    paths: ['assets/minecraft/lang/en_us.json'],
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
  execFileSync('git', args, { cwd, stdio: 'inherit' })
}

function fetchSource({ dir, repo, ref, paths }: Source) {
  if (existsSync(dir)) return
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

function collectRecipes(): Recipe[] {
  const recipes: Recipe[] = []
  let skipped = 0

  const createDir = join(
    sources.create.dir,
    'src/generated/resources/data/create/recipe',
  )
  for (const [name, path] of jsonFiles(createDir)) {
    const raw = readJson(path)
    if (!isSupportedCreateType(raw)) continue
    const recipe = normalizeCreateRecipe(`create:${name}`, raw)
    if (recipe) recipes.push(recipe)
    else skipped++
  }

  const vanillaDir = join(sources.vanillaData.dir, 'data/minecraft/recipe')
  for (const [name, path] of jsonFiles(vanillaDir)) {
    const recipe = deriveCompacting(`minecraft:${name}`, readJson(path))
    if (recipe) recipes.push(recipe)
  }

  console.log(
    `${recipes.length} recipes (skipped ${skipped} of the supported types: mod compat, tags or fluids)`,
  )
  return recipes
}

function titleCase(path: string) {
  return path.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function collectItems(recipes: Recipe[]): Record<string, ItemInfo> {
  const lang = {
    ...readJson(
      join(sources.vanillaLang.dir, 'assets/minecraft/lang/en_us.json'),
    ),
    ...readJson(
      join(
        sources.create.dir,
        'src/generated/resources/assets/create/lang/en_us.json',
      ),
    ),
  } as Record<string, string>

  const ids = new Set<string>()
  for (const recipe of recipes) {
    for (const { item } of [...recipe.inputs, ...recipe.outputs]) ids.add(item)
  }

  rmSync(textureDir, { recursive: true, force: true })
  const items: Record<string, ItemInfo> = {}
  let withoutIcon = 0
  for (const id of [...ids].sort()) {
    const [namespace, path] = id.split(':')
    const name =
      lang[`item.${namespace}.${path}`] ??
      lang[`block.${namespace}.${path}`] ??
      titleCase(path)
    const item: ItemInfo = { id, name }

    const texturesRoot =
      namespace === 'create'
        ? join(sources.create.dir, 'src/main/resources/assets/create/textures')
        : join(sources.vanillaTextures.dir, 'assets/minecraft/textures')
    const texture = ['item', 'block']
      .map((kind) => join(texturesRoot, kind, `${path}.png`))
      .find(existsSync)
    if (texture) {
      const target = join(textureDir, namespace, `${path}.png`)
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(texture, target)
      item.icon = `textures/${namespace}/${path}.png`
    } else {
      withoutIcon++
    }
    items[id] = item
  }
  console.log(`${ids.size} items (${withoutIcon} without icon)`)
  return items
}

function main() {
  for (const source of Object.values(sources)) fetchSource(source)

  const recipes = collectRecipes()
  const items = collectItems(recipes)
  const data: GameData = {
    meta: {
      create: CREATE_VERSION,
      minecraft: MINECRAFT_VERSION,
      createTag: CREATE_TAG,
    },
    items,
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
      '',
    ].join('\n'),
  )
  console.log(`Wrote ${relative(root, outFile)}`)
}

main()
