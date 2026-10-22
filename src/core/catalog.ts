import type { GameData, ItemInfo, Recipe } from '../data/types'
import { MACHINES_BY_TYPE, type MachineId } from './machines'

export interface RecipeOption {
  recipe: Recipe
  machine: MachineId
}

/** Lookup structure over the generated game data. */
export interface Catalog {
  data: GameData
  item(id: string): ItemInfo
  recipe(id: string): Recipe | undefined
  /** Recipes producing the item, with every machine that can run them. */
  producers(item: string): RecipeOption[]
  /** Recipes consuming the item, with every machine that can run them. */
  consumers(item: string): RecipeOption[]
  /** Every recipe/machine combination. */
  options(): RecipeOption[]
  machinesFor(recipe: Recipe): MachineId[]
}

export function createCatalog(data: GameData): Catalog {
  const recipes = new Map(data.recipes.map((r) => [r.id, r]))
  // Crushing wheels fall back to milling recipes only for inputs without a crushing recipe
  // (CrushingWheelControllerBlockEntity.findRecipe).
  const crushable = new Set(
    data.recipes
      .filter((r) => r.type === 'crushing')
      .flatMap((r) => r.inputs.map((i) => i.item)),
  )

  const machinesFor = (recipe: Recipe): MachineId[] =>
    MACHINES_BY_TYPE[recipe.type].filter(
      (machine) =>
        !(
          recipe.type === 'milling' &&
          machine === 'crushing_wheels' &&
          recipe.inputs.some((i) => crushable.has(i.item))
        ),
    )

  const options = data.recipes.flatMap((recipe) =>
    machinesFor(recipe).map((machine) => ({ recipe, machine })),
  )

  return {
    data,
    item: (id) => data.items[id] ?? { id, name: id },
    recipe: (id) => recipes.get(id),
    producers: (item) =>
      options.filter((o) => o.recipe.outputs.some((r) => r.item === item)),
    consumers: (item) =>
      options.filter((o) => o.recipe.inputs.some((i) => i.item === item)),
    options: () => options,
    machinesFor,
  }
}
