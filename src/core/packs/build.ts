// Recipe packs from addon jars → items, tags and recipes on top of the base data (DESIGN §6).
import type { GameData, ItemInfo, Recipe, ResourceId } from '../../data/types'
import { conditionsMet } from '../gamedata/conditions.ts'
import { iconTexture } from '../gamedata/models.ts'
import { resourceName, tagName, type Lang } from '../gamedata/names.ts'
import {
  bucketRecipes,
  createNormalizer,
  isCreateType,
} from '../gamedata/normalize.ts'
import { runtimeRecipes } from '../gamedata/runtime.ts'
import { TagIndex, type TagEntries } from '../gamedata/tags.ts'
import type { PackArchive } from './archive'
import { addonFanTypes } from './fans.ts'

export interface PackInput {
  id: string
  archive: PackArchive
}

export interface PackReport {
  id: string
  /** Recipes the pack adds or overrides, derived ones included. */
  recipes: number
  /** Skipped recipe files by reason. */
  skipped: Record<string, number>
}

export interface BuiltPacks {
  /** Items, tags and recipes the packs add or change; see `mergeGameData`. */
  data: Pick<GameData, 'items' | 'tags' | 'recipes'>
  /** Pack id of every pack recipe. */
  recipePack: Record<string, string>
  /** PNG icons of pack items, fluids and tags by resource id. */
  icons: Record<ResourceId, Uint8Array>
  reports: PackReport[]
}

/** Present in every game the base data describes. */
const BASE_MODS = ['minecraft', 'neoforge', 'create']
/** Namespaces the base data already covers (items, buckets, runtime recipes). */
const BASE_NAMESPACES = new Set(['minecraft', 'create'])

const namespaceOf = (id: ResourceId) =>
  (id.startsWith('fluid:') ? id.slice(6) : id).split(':')[0]

/** Normalizes all active packs together, so tags and conditions see every loaded mod. */
export function buildPacks(
  packs: PackInput[],
  base: GameData,
  baseTags: TagEntries,
): BuiltPacks {
  const loaded = new Set(BASE_MODS)
  for (const { archive } of packs) {
    for (const mod of archive.mods) loaded.add(mod.id)
    for (const namespace of archive.namespaces) loaded.add(namespace)
  }
  const tagIndex = TagIndex.fromJSON(baseTags, (id) =>
    loaded.has(id.split(':')[0]),
  )
  for (const { archive } of packs)
    for (const { kind, tag, json } of archive.tags)
      tagIndex.add(kind, tag, json)
  const normalizer = createNormalizer(tagIndex)

  const lang: Lang = Object.assign({}, ...packs.map((p) => p.archive.lang))
  const fans = addonFanTypes(
    packs.flatMap((p) => p.archive.tags),
    tagIndex,
    (id) => base.items[id]?.name ?? resourceName(id, lang),
  )
  const recipes = new Map<string, Recipe>()
  const recipePack: Record<string, string> = {}
  const reports: PackReport[] = []

  for (const { id: packId, archive } of packs) {
    const report: PackReport = { id: packId, recipes: 0, skipped: {} }
    const skip = (reason: string) =>
      (report.skipped[reason] = (report.skipped[reason] ?? 0) + 1)
    const add = (recipe: Recipe) => {
      recipes.set(recipe.id, recipe)
      recipePack[recipe.id] = packId
      report.recipes++
    }

    for (const [id, raw] of Object.entries(archive.recipes)) {
      const { 'neoforge:conditions': conditions, ...rest } = raw
      if (!conditionsMet(conditions, loaded)) {
        skip('condition not met')
        continue
      }
      const type = String(rest.type ?? '')
      if (type.startsWith('minecraft:')) {
        normalizer.vanillaRecipes(id, rest).forEach(add)
      } else if (isCreateType(type)) {
        const recipe = normalizer.createRecipe(id, rest)
        if (recipe) add(recipe)
        else skip('unsupported ingredients')
      } else if (fans.has(type)) {
        const recipe = normalizer.fanRecipe(id, rest, fans.get(type)!)
        if (recipe) add(recipe)
        else skip('unsupported ingredients')
      } else skip(`unknown type ${type}`)
    }

    const own = archive.namespaces.filter((n) => !BASE_NAMESPACES.has(n))
    // Create's runtime wood recipes for the pack's own logs (item registry from its names)
    const registry = new Set(
      Object.keys(archive.lang).flatMap((key) => {
        const [kind, namespace, path] = key.split('.')
        return (kind === 'item' || kind === 'block') &&
          own.includes(namespace) &&
          path
          ? [`${namespace}:${path}`]
          : []
      }),
    )
    runtimeRecipes(registry).forEach(add)

    const fluids = new Set<string>()
    for (const recipe of recipes.values())
      if (recipePack[recipe.id] === packId)
        for (const { item } of [...recipe.inputs, ...recipe.outputs])
          if (item.startsWith('fluid:') && !item.includes('#'))
            fluids.add(item.slice(6))
    for (const fluid of [...fluids].sort()) {
      const [namespace, path] = fluid.split(':')
      if (
        own.includes(namespace) &&
        archive.lang[`item.${namespace}.${path}_bucket`]
      )
        bucketRecipes(fluid, `${namespace}:${path}_bucket`).forEach(add)
    }
    reports.push(report)
  }

  const { items, icons } = collectItems(
    [...recipes.values()],
    normalizer,
    base,
    lang,
    packs,
  )
  return {
    data: {
      items,
      tags: Object.fromEntries(
        [...normalizer.tags].sort(([a], [b]) => a.localeCompare(b)),
      ),
      recipes: [...recipes.values()],
    },
    recipePack,
    icons,
    reports,
  }
}

function collectItems(
  recipes: Recipe[],
  normalizer: ReturnType<typeof createNormalizer>,
  base: GameData,
  lang: Lang,
  packs: PackInput[],
) {
  const models: Record<string, Record<string, unknown>> = Object.assign(
    {},
    ...packs.map((p) => p.archive.models),
  )
  const textures: Record<string, Uint8Array> = Object.assign(
    {},
    ...packs.map((p) => p.archive.textures),
  )
  const texture = (id: string) => {
    const [namespace, path] = id.split(':')
    return [
      `${namespace}:item/${path}`,
      `${namespace}:block/${path}`,
      iconTexture(id, (model) => models[model]),
    ]
      .filter((t) => t !== undefined)
      .map((t) => textures[t])
      .find((png) => png !== undefined)
  }

  const ids = new Set<ResourceId>()
  for (const recipe of recipes) {
    for (const { item } of [...recipe.inputs, ...recipe.outputs]) ids.add(item)
    if (recipe.tool) ids.add(recipe.tool)
  }
  for (const id of [...ids])
    for (const member of normalizer.tags.get(id) ?? []) ids.add(member)

  const items: Record<ResourceId, ItemInfo> = {}
  const icons: Record<ResourceId, Uint8Array> = {}
  const sorted = [...ids].sort()
  for (const id of sorted.filter((id) => !id.includes('#'))) {
    if (base.items[id]) continue
    items[id] = { id, name: resourceName(id, lang) }
    const fluid = id.startsWith('fluid:')
    if (BASE_NAMESPACES.has(namespaceOf(id))) continue
    const png = texture(fluid ? `${id.slice(6)}_bucket` : id)
    if (png) icons[id] = png
  }
  // a pack can add members to a tag the base already has, so pack tags are rebuilt
  for (const id of sorted.filter((id) => id.includes('#'))) {
    const members = normalizer.tags.get(id) ?? []
    const info = (member: ResourceId) => items[member] ?? base.items[member]
    const item: ItemInfo = {
      id,
      name: tagName(
        id,
        members.map((member) => info(member).name),
        normalizer.syntheticTags.has(id),
      ),
    }
    const first = members[0]
    if (info(first)?.icon) item.icon = info(first).icon
    else if (icons[first]) icons[id] = icons[first]
    items[id] = item
  }
  return { items, icons }
}

/** Base data with the packs' items, tags and recipes; a pack recipe replaces the base recipe with its id. */
export function mergeGameData(
  base: GameData,
  packs: BuiltPacks['data'],
): GameData {
  const replaced = new Set(packs.recipes.map((r) => r.id))
  return {
    meta: base.meta,
    items: { ...base.items, ...packs.items },
    tags: { ...base.tags, ...packs.tags },
    recipes: [
      ...base.recipes.filter((r) => !replaced.has(r.id)),
      ...packs.recipes,
    ],
  }
}
