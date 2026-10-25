// Pure conversion from raw recipe JSON (Create 6.0.10 / MC 1.21.1 format) to our data model.
import type {
  HeatRequirement,
  Ingredient,
  Recipe,
  RecipeType,
  ResourceId,
  Result,
} from '../../data/types.ts'
import type { TagIndex } from './tags.ts'

const CREATE_TYPES: ReadonlySet<string> = new Set<RecipeType>([
  'crushing',
  'milling',
  'splashing',
  'haunting',
  'pressing',
  'compacting',
  'mixing',
  'cutting',
  'deploying',
  'item_application',
  'sandpaper_polishing',
  'filling',
  'emptying',
  'mechanical_crafting',
])

/** Whether `type` (e.g. "create:milling") is a Create recipe type we model. */
export const isCreateType = (type: string) =>
  type.startsWith('create:') && CREATE_TYPES.has(type.slice(7))

const COOKING_TYPES: ReadonlySet<string> = new Set<RecipeType>([
  'smelting',
  'blasting',
  'smoking',
])

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const fluidId = (id: string) => `fluid:${id}`

/** Flowing fluids are only the moving form of their source fluid. */
const isSourceFluid = (id: string) => !id.split(':')[1].startsWith('flowing_')

function mergeIngredients(ingredients: Ingredient[]): Ingredient[] {
  const merged = new Map<ResourceId, number>()
  for (const { item, amount } of ingredients)
    merged.set(item, (merged.get(item) ?? 0) + amount)
  return [...merged].map(([item, amount]) => ({ item, amount }))
}

function readResult(raw: unknown): Result | undefined {
  if (!isObject(raw) || typeof raw.id !== 'string') return undefined
  const chance = typeof raw.chance === 'number' ? raw.chance : 1
  // FluidStack results carry `amount` (mB), ItemStack results `count`
  if (typeof raw.amount === 'number')
    return { item: fluidId(raw.id), amount: raw.amount, chance }
  const amount = typeof raw.count === 'number' ? raw.count : 1
  return { item: raw.id, amount, chance }
}

/** Mixer: CraftingRecipes that are not shaped, have more than one ingredient and are not
 * compressible (MechanicalMixerBlockEntity.matchStaticFilters, config allowShapelessInMixer). */
const MIN_SHAPELESS_MIXING_INGREDIENTS = 2

/** AllRecipeTypes.shouldIgnoreInAutomation */
const ignoredInAutomation = (id: string) => id.endsWith('_manual_only')

export function createNormalizer(tagIndex: TagIndex) {
  /** Members of every multi-member tag a recipe refers to, including synthetic ones. */
  const tags = new Map<ResourceId, ResourceId[]>()
  /** Tags made up for a recipe's list of alternative ingredients. */
  const syntheticTags = new Set<ResourceId>()

  /** One resource for a list of acceptable members, or undefined if none is supported. */
  function oneOf(
    members: ResourceId[],
    tagName: ResourceId,
  ): ResourceId | undefined {
    const unique = [...new Set(members)]
    if (unique.length === 0) return undefined
    if (unique.length === 1) return unique[0]
    tags.set(tagName, unique)
    return tagName
  }

  /** Item members a single (non-array) item ingredient accepts. */
  function itemMembers(raw: unknown): ResourceId[] | undefined {
    if (!isObject(raw)) return undefined
    if (typeof raw.item === 'string' && Object.keys(raw).length === 1)
      return [raw.item]
    if (typeof raw.tag === 'string' && Object.keys(raw).length === 1)
      return tagIndex.resolve('item', raw.tag)
    return undefined
  }

  /** @param synthetic tag name used when `raw` is a list of alternatives */
  function readIngredient(
    raw: unknown,
    synthetic: string,
  ): Ingredient | undefined {
    if (Array.isArray(raw)) {
      const members = raw.map(itemMembers)
      if (members.some((m) => m === undefined)) return undefined
      const item = oneOf(members.flat() as ResourceId[], `#${synthetic}`)
      if (item === `#${synthetic}`) syntheticTags.add(item)
      return item ? { item, amount: 1 } : undefined
    }
    if (!isObject(raw)) return undefined
    if (raw.type === 'neoforge:single' && typeof raw.fluid === 'string') {
      return { item: fluidId(raw.fluid), amount: Number(raw.amount) }
    }
    if (raw.type === 'neoforge:tag' && typeof raw.tag === 'string') {
      const members = tagIndex
        .resolve('fluid', raw.tag)
        .filter(isSourceFluid)
        .map(fluidId)
      const item = oneOf(members, fluidId(`#${raw.tag}`))
      return item ? { item, amount: Number(raw.amount) } : undefined
    }
    const members = itemMembers(raw)
    if (!members) return undefined
    const item = oneOf(members, `#${raw.tag}`)
    return item ? { item, amount: 1 } : undefined
  }

  function readIngredients(
    raws: unknown[],
    recipeId: string,
  ): Ingredient[] | undefined {
    const ingredients = raws.map((raw, i) =>
      readIngredient(raw, `${recipeId}/input${i === 0 ? '' : `_${i}`}`),
    )
    if (ingredients.some((i) => i === undefined)) return undefined
    return ingredients as Ingredient[]
  }

  /** Shaped crafting grid → ingredients per cell (spaces are undefined). */
  function readGrid(raw: Json, recipeId: string) {
    const pattern = raw.pattern as string[]
    const key = raw.key as Json
    const cells = pattern.join('').split('')
    const byKey = new Map<string, Ingredient | undefined>()
    for (const [char, value] of Object.entries(key))
      byKey.set(char, readIngredient(value, `${recipeId}/${char}`))
    return {
      rows: pattern.length,
      columns: Math.max(...pattern.map((row) => row.length)),
      cells: cells.map((c) => (c === ' ' ? null : byKey.get(c))),
    }
  }

  function createRecipe(id: string, raw: Json): Recipe | undefined {
    const type = String(raw.type ?? '').replace(/^create:/, '')
    if (!CREATE_TYPES.has(type)) return undefined
    // e.g. neoforge:mod_loaded — recipes for other mods' items
    if (raw['neoforge:conditions'] !== undefined) return undefined

    let inputs: Ingredient[] | undefined
    let rawResults: unknown[]
    let gridSize: number | undefined
    let tool: ResourceId | undefined

    if (type === 'mechanical_crafting') {
      const grid = readGrid(raw, id)
      const used = grid.cells.filter((c) => c !== null)
      if (used.some((c) => c === undefined)) return undefined
      inputs = used as Ingredient[]
      gridSize = used.length
      rawResults = [raw.result]
    } else {
      if (!Array.isArray(raw.ingredients) || !Array.isArray(raw.results))
        return undefined
      inputs = readIngredients(raw.ingredients, id)
      rawResults = raw.results
      // DeployerApplicationRecipe / ItemApplicationRecipe: [target, held item]
      if (inputs && raw.keep_held_item === true && inputs.length === 2) {
        tool = inputs[1].item
        inputs = [inputs[0]]
      }
    }
    if (!inputs) return undefined

    const outputs = rawResults.map(readResult)
    if (outputs.length === 0 || outputs.some((r) => r === undefined))
      return undefined

    const recipe: Recipe = {
      id,
      type: type as RecipeType,
      inputs: mergeIngredients(inputs),
      outputs: outputs as Result[],
    }
    if (typeof raw.processing_time === 'number')
      recipe.processingTime = raw.processing_time
    if (
      raw.heat_requirement === 'heated' ||
      raw.heat_requirement === 'superheated'
    )
      recipe.heat = raw.heat_requirement as HeatRequirement
    if (tool) recipe.tool = tool
    if (gridSize) recipe.gridSize = gridSize
    return recipe
  }

  /** Crafting recipes as the press (compacting) or mixer would run them, if at all. */
  function craftingRecipe(id: string, raw: Json): Recipe | undefined {
    if (ignoredInAutomation(id)) return undefined
    const shaped = raw.type === 'minecraft:crafting_shaped'
    let cells: (Ingredient | undefined | null)[]
    if (shaped) cells = readGrid(raw, id).cells
    else if (Array.isArray(raw.ingredients))
      cells = raw.ingredients.map((value, i) =>
        readIngredient(value, `${id}/input${i === 0 ? '' : `_${i}`}`),
      )
    else return undefined

    const result = readResult(raw.result)
    if (!result || cells.some((c) => c === undefined)) return undefined
    const first = cells[0]

    // MechanicalPressBlockEntity.canCompress: 4 or 9 ingredients, all the same
    // (empty grid cells count as ingredients, so shaped recipes must fill a square)
    const compressible =
      (cells.length === 4 || cells.length === 9) &&
      first != null &&
      cells.every((c) => c?.item === first.item)
    if (compressible) {
      return {
        id,
        type: 'compacting',
        inputs: [{ item: first.item, amount: cells.length }],
        outputs: [result],
        derivedFrom: 'crafting',
      }
    }
    if (shaped || cells.length < MIN_SHAPELESS_MIXING_INGREDIENTS)
      return undefined
    return {
      id,
      type: 'mixing',
      inputs: mergeIngredients(cells as Ingredient[]),
      outputs: [result],
      derivedFrom: 'crafting',
    }
  }

  /** Vanilla recipes Create machines or vanilla blocks run in our model. */
  function vanillaRecipes(id: string, raw: Json): Recipe[] {
    if (raw['neoforge:conditions'] !== undefined) return []
    const type = String(raw.type ?? '').replace(/^minecraft:/, '')
    if (type === 'crafting_shaped' || type === 'crafting_shapeless') {
      const recipe = craftingRecipe(id, raw)
      return recipe ? [recipe] : []
    }
    if (!COOKING_TYPES.has(type) && type !== 'stonecutting') return []

    const input = readIngredient(raw.ingredient, `${id}/input`)
    const result = readResult(raw.result)
    if (!input || !result) return []
    if (type === 'stonecutting') {
      // SawBlockEntity: stonecutting recipes run on the saw (config allowStonecuttingOnSaw)
      return [
        {
          id,
          type: 'cutting',
          inputs: [input],
          outputs: [result],
          derivedFrom: 'stonecutting',
        },
      ]
    }
    const recipe: Recipe = {
      id,
      type: type as RecipeType,
      inputs: [input],
      outputs: [result],
    }
    if (typeof raw.cookingtime === 'number')
      recipe.processingTime = raw.cookingtime
    return [recipe]
  }

  return { tags, syntheticTags, createRecipe, vanillaRecipes }
}

export type Normalizer = ReturnType<typeof createNormalizer>

/** Buckets are filled by a spout and emptied by a drain without a recipe file
 * (GenericItemFilling / GenericItemEmptying via the item's fluid handler). */
export function bucketRecipes(fluid: string, bucket: string): Recipe[] {
  const [namespace, path] = fluid.split(':')
  const bucketFluid = { item: fluidId(fluid), amount: 1000 }
  return [
    {
      id: `derived:filling/${namespace}/${path}`,
      type: 'filling',
      inputs: [{ item: 'minecraft:bucket', amount: 1 }, bucketFluid],
      outputs: [{ item: bucket, amount: 1, chance: 1 }],
      derivedFrom: 'bucket',
    },
    {
      id: `derived:emptying/${namespace}/${path}`,
      type: 'emptying',
      inputs: [{ item: bucket, amount: 1 }],
      outputs: [
        { item: 'minecraft:bucket', amount: 1, chance: 1 },
        { ...bucketFluid, chance: 1 },
      ],
      derivedFrom: 'bucket',
    },
  ]
}
