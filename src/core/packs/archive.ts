// Reads the recipe-relevant entries of a mod jar, datapack or KubeJS export zip (DESIGN §6).
import { strFromU8, unzipSync, type UnzipFileInfo } from 'fflate'
import type { TagEntry, TagKind } from '../gamedata/tags.ts'

export interface ModInfo {
  id: string
  name: string
  version: string
}

export interface TagFile {
  kind: TagKind
  /** e.g. "c:ingots/zinc" */
  tag: string
  json: { replace?: boolean; values?: TagEntry[] }
}

/** Raw archive contents, as stored for a recipe pack; normalized by `buildPacks`. */
export interface PackArchive {
  /** Mods declared in `neoforge.mods.toml` (empty for datapacks). */
  mods: ModInfo[]
  /** Namespaces with data or assets in the archive, sorted. */
  namespaces: string[]
  /** Recipe JSON by recipe id, e.g. "createaddition:rolling/iron_ingot". */
  recipes: Record<string, Record<string, unknown>>
  tags: TagFile[]
  /** en_us names of all namespaces. */
  lang: Record<string, string>
  /** Item and block models by id, e.g. "createaddition:item/iron_rod". */
  models: Record<string, Record<string, unknown>>
  /** Item and block PNG textures by id, e.g. "createaddition:item/iron_rod". */
  textures: Record<string, Uint8Array>
}

export class ArchiveError extends Error {}

const RECIPE = /^data\/([a-z0-9_.-]+)\/recipe\/(.+)\.json$/
const LEGACY_RECIPE = /^data\/[a-z0-9_.-]+\/recipes\/.+\.json$/
const TAG = /^data\/([a-z0-9_.-]+)\/tags\/(item|fluid)\/(.+)\.json$/
const LANG = /^assets\/([a-z0-9_.-]+)\/lang\/en_us\.json$/
const MODEL = /^assets\/([a-z0-9_.-]+)\/models\/((?:item|block)\/.+)\.json$/
const TEXTURE = /^assets\/([a-z0-9_.-]+)\/textures\/((?:item|block)\/.+)\.png$/
/** Namespaces the archive adds items or recipes to (not those it only tags into). */
const NAMESPACE = /^(?:assets\/([a-z0-9_.-]+)\/|data\/([a-z0-9_.-]+)\/recipe\/)/
const MODS_TOML = 'META-INF/neoforge.mods.toml'
const MANIFEST = 'META-INF/MANIFEST.MF'
const NESTED_JAR = /^META-INF\/jarjar\/[^/]+\.jar$/

const wanted = (name: string) =>
  name === MODS_TOML ||
  name === MANIFEST ||
  NESTED_JAR.test(name) ||
  [RECIPE, TAG, LANG, MODEL, TEXTURE].some((pattern) => pattern.test(name))

/** `[[mods]]` entries of a mods.toml; only the keys we need, multi-line strings skipped. */
export function parseModsToml(toml: string, jarVersion = ''): ModInfo[] {
  const tables: Record<string, string>[] = []
  let current: Record<string, string> | undefined
  let inMultiline = false
  for (const line of toml.split(/\r?\n/)) {
    const quotes = line.match(/'''|"""/g)?.length ?? 0
    if (inMultiline || quotes % 2 === 1) {
      if (quotes % 2 === 1) inMultiline = !inMultiline
      continue
    }
    const trimmed = line.trim()
    if (trimmed.startsWith('[')) {
      current = trimmed === '[[mods]]' ? {} : undefined
      if (current) tables.push(current)
      continue
    }
    const pair = /^(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(trimmed)
    if (current && pair) current[pair[1]] = pair[2] ?? pair[3]
  }
  return tables
    .filter((table) => table.modId)
    .map((table) => ({
      id: table.modId,
      name: table.displayName ?? table.modId,
      version:
        !table.version || table.version === '${file.jarVersion}'
          ? jarVersion
          : table.version,
    }))
}

function parseJson(bytes: Uint8Array): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(strFromU8(bytes))
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/** Decompresses only the entries we read; `onName` sees every entry name. */
function unzip(bytes: Uint8Array, onName: (name: string) => void) {
  try {
    return unzipSync(bytes, {
      filter: (file: UnzipFileInfo) => {
        onName(file.name)
        return wanted(file.name)
      },
    })
  } catch {
    throw new ArchiveError('This is not a mod jar or zip file.')
  }
}

function emptyArchive(): PackArchive {
  return {
    mods: [],
    namespaces: [],
    recipes: {},
    tags: [],
    lang: {},
    models: {},
    textures: {},
  }
}

function collect(
  bytes: Uint8Array,
  into: PackArchive,
  legacy: { count: number },
) {
  const namespaces = new Set<string>()
  const files = unzip(bytes, (name) => {
    const match = NAMESPACE.exec(name)
    if (match) namespaces.add(match[1] ?? match[2])
    if (LEGACY_RECIPE.test(name)) legacy.count++
  })
  let jarVersion = ''
  let toml: string | undefined

  for (const [name, data] of Object.entries(files)) {
    let match: RegExpExecArray | null
    if (name === MODS_TOML) toml = strFromU8(data)
    else if (name === MANIFEST)
      jarVersion =
        /^Implementation-Version:\s*(.+?)\s*$/m.exec(strFromU8(data))?.[1] ?? ''
    else if (NESTED_JAR.test(name)) {
      // bundled libraries; a broken one must not reject the mod
      try {
        collect(data, into, legacy)
      } catch {
        continue
      }
    } else if ((match = RECIPE.exec(name))) {
      const json = parseJson(data)
      if (json) into.recipes[`${match[1]}:${match[2]}`] = json
    } else if ((match = TAG.exec(name))) {
      const json = parseJson(data)
      if (json)
        into.tags.push({
          kind: match[2] as TagKind,
          tag: `${match[1]}:${match[3]}`,
          json,
        })
    } else if (LANG.test(name))
      Object.assign(into.lang, parseJson(data) as Record<string, string>)
    else if ((match = MODEL.exec(name))) {
      const json = parseJson(data)
      if (json) into.models[`${match[1]}:${match[2]}`] = json
    } else if ((match = TEXTURE.exec(name)))
      into.textures[`${match[1]}:${match[2]}`] = data
  }
  if (toml) into.mods.push(...parseModsToml(toml, jarVersion))
  // a nested jar has already added its namespaces to `into`
  into.namespaces = [...new Set([...into.namespaces, ...namespaces])].sort()
}

/** @throws ArchiveError for non-zip files, the 1.20.1 layout and archives without recipes or tags */
export function readArchive(bytes: Uint8Array): PackArchive {
  const archive = emptyArchive()
  const legacy = { count: 0 }
  collect(bytes, archive, legacy)
  const recipes = Object.keys(archive.recipes).length
  if (recipes === 0 && legacy.count > 0)
    throw new ArchiveError(
      'This archive uses the Minecraft 1.20.1 layout; the modeler supports mods for 1.21.1.',
    )
  if (recipes === 0 && archive.tags.length === 0)
    throw new ArchiveError('This archive contains no recipes or tags.')
  return archive
}
