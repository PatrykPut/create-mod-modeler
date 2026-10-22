// Shape of the generated data file (scripts/data/build.ts → src/data/create-6.0.10.json).

export type RecipeType =
  'crushing' | 'milling' | 'splashing' | 'pressing' | 'compacting'

export interface ItemInfo {
  id: string
  name: string
  /** Path relative to the app base, e.g. "textures/minecraft/gravel.png". */
  icon?: string
}

export interface Ingredient {
  item: string
  amount: number
}

export interface Result {
  item: string
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
  /** Set for recipes Create derives from vanilla ones (e.g. 3×3 crafting → compacting). */
  derivedFrom?: string
}

export interface GameData {
  meta: {
    create: string
    minecraft: string
    createTag: string
  }
  items: Record<string, ItemInfo>
  recipes: Recipe[]
}
