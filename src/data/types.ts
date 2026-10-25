// Shape of the generated data file (scripts/data/build.ts → src/data/create-6.0.10.json).

export type RecipeType =
  | 'crushing'
  | 'milling'
  | 'splashing'
  | 'haunting'
  | 'pressing'
  | 'compacting'
  | 'mixing'
  | 'cutting'
  | 'deploying'
  | 'item_application'
  | 'sandpaper_polishing'
  | 'filling'
  | 'emptying'
  | 'mechanical_crafting'
  | 'smelting'
  | 'blasting'
  | 'smoking'

export type HeatRequirement = 'heated' | 'superheated'

/**
 * A resource id. Items: "minecraft:gravel". Fluids: "fluid:minecraft:water" (amounts in mB).
 * Tags with several members: "#minecraft:planks" / "fluid:#c:milk" — any member fits.
 */
export type ResourceId = string

export interface ItemInfo {
  id: ResourceId
  name: string
  /** Path relative to the app base, e.g. "textures/minecraft/gravel.png". */
  icon?: string
  /** The icon is a 64 px isometric render of the block model, not a 16 px texture. */
  rendered?: boolean
}

export interface Ingredient {
  item: ResourceId
  amount: number
}

export interface Result {
  item: ResourceId
  amount: number
  /** 1 for guaranteed outputs. */
  chance: number
}

export interface Recipe {
  /** Recipe id, e.g. "create:milling/cobblestone". */
  id: string
  type: RecipeType
  inputs: Ingredient[]
  outputs: Result[]
  /** Ticks, as given in the recipe JSON. Absent when the machine uses its default. */
  processingTime?: number
  heat?: HeatRequirement
  /** Deploying: item held by the deployer that is not used up. */
  tool?: ResourceId
  /** Mechanical crafting: number of crafters in the grid. */
  gridSize?: number
  /** Set for recipes Create derives from vanilla ones (e.g. 3×3 crafting → compacting). */
  derivedFrom?: string
}

export interface GameData {
  meta: {
    create: string
    minecraft: string
    createTag: string
  }
  /** Items, fluids and multi-member tags used by the recipes. */
  items: Record<ResourceId, ItemInfo>
  /** Members of every multi-member tag in `items`. */
  tags: Record<ResourceId, ResourceId[]>
  recipes: Recipe[]
}
