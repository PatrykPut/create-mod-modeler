// Addon recipes kept inside the plan, so a plan still works without the packs it was built with
// (DESIGN §6). A loaded pack always wins; the saved copy only fills in what the catalog lacks.
import type { GameData, ItemInfo, Recipe, ResourceId } from '../../data/types'
import type { Catalog } from '../catalog'
import { MACHINES_BY_TYPE } from '../machines'
import type { AddonRecipes, Plan } from './plan'

export interface PackInfo {
  name: string
  version: string
}

/** What the active packs contribute, as packs.ts keeps it. */
export interface ActivePacks {
  /** Pack id of every pack recipe. */
  recipePack: Record<string, string>
  packs: Record<string, PackInfo>
  /** PNG icons of pack items by resource id. */
  icons: Record<ResourceId, Uint8Array>
}

// in chunks: spreading a large array into fromCharCode overflows the call stack
const CHUNK = 0x8000

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(binary)
}

const PNG_DATA = 'data:image/png;base64,'

interface Lookup {
  item(id: ResourceId): ItemInfo | undefined
  tag(id: ResourceId): ResourceId[] | undefined
  icon(id: ResourceId): string | undefined
}

/** Adds a recipe with the addon items, tags and icons it uses. */
function add(
  out: Required<AddonRecipes>,
  recipe: Recipe,
  packId: string,
  pack: PackInfo | undefined,
  lookup: Lookup,
  base: GameData,
) {
  out.recipes.push(recipe)
  out.recipePack[recipe.id] = packId
  if (pack) out.packs[packId] = pack
  const ids = new Set(
    [...recipe.inputs, ...recipe.outputs].map(({ item }) => item),
  )
  if (recipe.tool) ids.add(recipe.tool)
  for (const id of [...ids]) {
    const members = lookup.tag(id)
    if (!members || base.tags[id]) continue
    out.tags[id] = members
    for (const member of members) ids.add(member)
  }
  for (const id of ids) {
    if (base.items[id]) continue
    const info = lookup.item(id)
    if (info) out.items[id] = info
    const icon = lookup.icon(id)
    if (icon) out.icons[id] = icon
  }
}

/**
 * The addon recipes the plan's recipe nodes use: fresh from the active packs, or the plan's
 * saved copy for recipes the catalog lacks. Undefined when the plan uses none.
 */
export function snapshotAddons(
  plan: Plan,
  catalog: Catalog,
  active: ActivePacks,
  base: GameData,
): AddonRecipes | undefined {
  const saved = plan.addons
  const out: Required<AddonRecipes> = {
    packs: {},
    recipes: [],
    recipePack: {},
    items: {},
    tags: {},
    icons: {},
  }
  const ids = [
    ...new Set(
      plan.nodes.flatMap((n) => (n.kind === 'recipe' ? [n.recipeId] : [])),
    ),
  ].sort()
  for (const id of ids) {
    const recipe = catalog.recipe(id)
    const packId = active.recipePack[id]
    if (recipe && packId) {
      const icon = active.icons
      add(
        out,
        recipe,
        packId,
        active.packs[packId],
        {
          item: (item) => catalog.data.items[item],
          tag: (tag) => catalog.data.tags[tag],
          icon: (item) => icon[item] && PNG_DATA + toBase64(icon[item]),
        },
        base,
      )
      continue
    }
    const copy = recipe ? undefined : saved?.recipes.find((r) => r.id === id)
    if (!saved || !copy) continue
    const savedPack = saved.recipePack[id]
    add(
      out,
      copy,
      savedPack,
      saved.packs[savedPack],
      {
        item: (item) => saved.items[item],
        tag: (tag) => saved.tags[tag],
        icon: (item) => saved.icons?.[item],
      },
      base,
    )
  }
  if (out.recipes.length === 0) return undefined
  const { icons, ...rest } = out
  return Object.keys(icons).length ? out : rest
}

/** The catalog with the plan's saved recipes, items and tags where it lacks them. */
export function withAddons(catalog: Catalog, addons?: AddonRecipes): Catalog {
  if (!addons) return catalog
  const recipes = new Map(
    addons.recipes.filter((r) => !catalog.recipe(r.id)).map((r) => [r.id, r]),
  )
  if (recipes.size === 0) return catalog
  const tag = (id: ResourceId) => catalog.data.tags[id] ?? addons.tags[id]
  // the add dialog's lists (options, producers, consumers) stay those of the loaded packs
  return {
    ...catalog,
    recipe: (id) => catalog.recipe(id) ?? recipes.get(id),
    item: (id) =>
      catalog.data.items[id] ?? addons.items[id] ?? catalog.item(id),
    members: (resource) => tag(resource) ?? [resource],
    accepts: (port, item) =>
      port === item || (tag(port)?.includes(item) ?? false),
  }
}

/** The pack of a recipe the catalog only has from the plan's saved copy. */
export function snapshotPack(
  addons: AddonRecipes | undefined,
  catalog: Catalog,
  recipeId: string,
): (PackInfo & { id: string }) | undefined {
  if (!addons || catalog.recipe(recipeId)) return undefined
  if (!addons.recipes.some((r) => r.id === recipeId)) return undefined
  const id = addons.recipePack[recipeId]
  return { id, ...(addons.packs[id] ?? { name: id, version: '' }) }
}

/** Packs whose recipes the plan only has as saved copies. */
export function missingPacks(
  addons: AddonRecipes | undefined,
  catalog: Catalog,
): (PackInfo & { id: string })[] {
  const packs = new Map<string, PackInfo & { id: string }>()
  for (const recipe of addons?.recipes ?? []) {
    const pack = snapshotPack(addons, catalog, recipe.id)
    if (pack) packs.set(pack.id, pack)
  }
  return [...packs.values()]
}

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isAmount = (value: unknown) =>
  isObject(value) &&
  typeof value.item === 'string' &&
  typeof value.amount === 'number'

function isRecipe(value: unknown): value is Recipe {
  if (!isObject(value) || typeof value.id !== 'string') return false
  const { type, inputs, outputs, heat, tool, fan } = value
  return (
    typeof type === 'string' &&
    Object.hasOwn(MACHINES_BY_TYPE, type) &&
    Array.isArray(inputs) &&
    inputs.every(isAmount) &&
    Array.isArray(outputs) &&
    outputs.every((o) => isAmount(o) && typeof o.chance === 'number') &&
    (heat === undefined || heat === 'heated' || heat === 'superheated') &&
    (tool === undefined || typeof tool === 'string') &&
    (fan === undefined || (isObject(fan) && typeof fan.mode === 'string'))
  )
}

/** Entries of an object whose values pass the check. */
function entries<T>(
  value: unknown,
  check: (v: unknown) => v is T,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(isObject(value) ? value : {}).filter(
      (entry): entry is [string, T] => check(entry[1]),
    ),
  )
}

const isString = (v: unknown): v is string => typeof v === 'string'

/** Reads the addon recipes of a plan file; broken parts are dropped. */
export function readAddons(value: unknown): AddonRecipes | undefined {
  if (!isObject(value) || !Array.isArray(value.recipes)) return undefined
  const recipes = value.recipes.filter(isRecipe)
  if (recipes.length === 0) return undefined
  const icons = entries(
    value.icons,
    (v): v is string => isString(v) && v.startsWith(PNG_DATA),
  )
  return {
    packs: entries(
      value.packs,
      (v): v is PackInfo =>
        isObject(v) && isString(v.name) && isString(v.version),
    ),
    recipes,
    recipePack: entries(value.recipePack, isString),
    items: entries(
      value.items,
      (v): v is ItemInfo =>
        isObject(v) &&
        isString(v.id) &&
        isString(v.name) &&
        (v.icon === undefined || isString(v.icon)),
    ),
    tags: entries(
      value.tags,
      (v): v is ResourceId[] => Array.isArray(v) && v.every(isString),
    ),
    ...(Object.keys(icons).length > 0 && { icons }),
  }
}
