// Pure conversion from raw recipe JSON (Create 6.0.10 / MC 1.21.1 format) to our data model.
import type {
  Ingredient,
  Recipe,
  RecipeType,
  Result,
} from '../../src/data/types.ts'

const SUPPORTED_TYPES: ReadonlySet<string> = new Set<RecipeType>([
  'crushing',
  'milling',
  'splashing',
  'pressing',
  'compacting',
])

type Json = Record<string, unknown>

/** Plain `{ item }` ingredient → item id; anything else (tags, fluids, alternatives) → undefined. */
function itemOf(ingredient: unknown): string | undefined {
  if (typeof ingredient !== 'object' || ingredient === null) return undefined
  if (Array.isArray(ingredient)) return undefined
  const keys = Object.keys(ingredient)
  const item = (ingredient as Json).item
  return keys.length === 1 && typeof item === 'string' ? item : undefined
}

function mergeIngredients(items: string[]): Ingredient[] {
  const merged = new Map<string, number>()
  for (const item of items) merged.set(item, (merged.get(item) ?? 0) + 1)
  return [...merged].map(([item, amount]) => ({ item, amount }))
}

function normalizeResult(raw: unknown): Result | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const { id, count, chance, amount } = raw as Json
  // fluid results carry an `amount` in mB; not supported yet
  if (typeof id !== 'string' || amount !== undefined) return undefined
  return {
    item: id,
    amount: typeof count === 'number' ? count : 1,
    chance: typeof chance === 'number' ? chance : 1,
  }
}

export function isSupportedCreateType(raw: Json): boolean {
  return SUPPORTED_TYPES.has(String(raw.type ?? '').replace(/^create:/, ''))
}

export function normalizeCreateRecipe(
  id: string,
  raw: Json,
): Recipe | undefined {
  const type = String(raw.type ?? '').replace(/^create:/, '')
  if (!SUPPORTED_TYPES.has(type)) return undefined
  // e.g. neoforge:mod_loaded — recipes for other mods' items
  if (raw['neoforge:conditions'] !== undefined) return undefined
  if (!Array.isArray(raw.ingredients) || !Array.isArray(raw.results))
    return undefined

  const items = raw.ingredients.map(itemOf)
  if (items.some((item) => item === undefined)) return undefined
  const outputs = raw.results.map(normalizeResult)
  if (outputs.length === 0 || outputs.some((r) => r === undefined))
    return undefined

  const recipe: Recipe = {
    id,
    type: type as RecipeType,
    inputs: mergeIngredients(items as string[]),
    outputs: outputs as Result[],
  }
  if (typeof raw.processing_time === 'number')
    recipe.processingTime = raw.processing_time
  return recipe
}

/**
 * Crafting recipes the Mechanical Press runs on a basin: 4 or 9 ingredients that are all
 * the same item (MechanicalPressBlockEntity.canCompress, config allowShapedSquareInPress).
 */
export function deriveCompacting(id: string, raw: Json): Recipe | undefined {
  // AllRecipeTypes.shouldIgnoreInAutomation
  if (id.endsWith('_manual_only')) return undefined

  let ingredients: (string | undefined)[]
  if (raw.type === 'minecraft:crafting_shaped') {
    const pattern = raw.pattern as string[]
    const key = raw.key as Json
    const cells = pattern.join('').split('')
    const square =
      pattern.every((row) => row.length === pattern.length) &&
      (pattern.length === 2 || pattern.length === 3)
    if (!square) return undefined
    ingredients = cells.map((c) => (c === ' ' ? undefined : itemOf(key[c])))
  } else if (raw.type === 'minecraft:crafting_shapeless') {
    ingredients = (raw.ingredients as unknown[]).map(itemOf)
  } else {
    return undefined
  }

  if (ingredients.length !== 4 && ingredients.length !== 9) return undefined
  const first = ingredients[0]
  if (first === undefined || ingredients.some((i) => i !== first))
    return undefined

  const result = normalizeResult(raw.result)
  if (!result) return undefined

  return {
    id,
    type: 'compacting',
    inputs: [{ item: first, amount: ingredients.length }],
    outputs: [result],
    derivedFrom: 'crafting',
  }
}
