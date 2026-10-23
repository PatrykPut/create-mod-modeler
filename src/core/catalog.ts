import type { GameData, ItemInfo, Recipe, ResourceId } from '../data/types'
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
  /** Items a resource stands for: the members of a tag, otherwise the resource itself. */
  members(resource: ResourceId): ResourceId[]
  /** Whether an input port for `port` takes `item` (same resource or a member of the tag). */
  accepts(port: ResourceId, item: ResourceId): boolean
  /** Recipes producing the resource (any member, for a tag), with every machine that can run them. */
  producers(resource: ResourceId): RecipeOption[]
  /** Recipes consuming the item, directly or through a tag, with every machine that can run them. */
  consumers(item: ResourceId): RecipeOption[]
  /** Every recipe/machine combination. */
  options(): RecipeOption[]
  machinesFor(recipe: Recipe): MachineId[]
}

export function createCatalog(data: GameData): Catalog {
  const recipes = new Map(data.recipes.map((r) => [r.id, r]))
  const members = (resource: ResourceId) => data.tags[resource] ?? [resource]
  const accepts = (port: ResourceId, item: ResourceId) =>
    port === item || (data.tags[port]?.includes(item) ?? false)

  const inputsOf = (type: Recipe['type']) =>
    new Set(
      data.recipes
        .filter((r) => r.type === type)
        .flatMap((r) => r.inputs.map((i) => i.item)),
    )
  // Crushing wheels fall back to milling recipes only for inputs without a crushing recipe
  // (CrushingWheelControllerBlockEntity.findRecipe).
  const crushable = inputsOf('crushing')
  // Fan blasting (AllFanProcessingTypes.BLASTING) uses smelting, then blasting recipes, and
  // destroys items whose smoking recipe gives the same result.
  const smeltable = inputsOf('smelting')
  const smoked = new Set(
    data.recipes
      .filter((r) => r.type === 'smoking')
      .flatMap((r) =>
        r.inputs.flatMap((i) => r.outputs.map((o) => `${i.item}>${o.item}`)),
      ),
  )

  const excluded = (recipe: Recipe, machine: MachineId) => {
    const inputs = recipe.inputs.map((i) => i.item)
    if (recipe.type === 'milling' && machine === 'crushing_wheels')
      return inputs.some((i) => crushable.has(i))
    if (machine !== 'fan_blasting') return false
    if (recipe.type === 'blasting') return inputs.some((i) => smeltable.has(i))
    return inputs.some((i) =>
      recipe.outputs.some((o) => smoked.has(`${i}>${o.item}`)),
    )
  }

  const machinesFor = (recipe: Recipe): MachineId[] =>
    MACHINES_BY_TYPE[recipe.type].filter((m) => !excluded(recipe, m))

  const options = data.recipes.flatMap((recipe) =>
    machinesFor(recipe).map((machine) => ({ recipe, machine })),
  )

  return {
    data,
    item: (id) => data.items[id] ?? { id, name: id },
    recipe: (id) => recipes.get(id),
    members,
    accepts,
    producers: (resource) => {
      const wanted = new Set(members(resource))
      return options.filter((o) =>
        o.recipe.outputs.some((r) => wanted.has(r.item)),
      )
    },
    consumers: (item) =>
      options.filter((o) => o.recipe.inputs.some((i) => accepts(i.item, item))),
    options: () => options,
    machinesFor,
  }
}
