import type { ItemInfo, Recipe, ResourceId } from '../../data/types'
import type { MachineId } from '../machines'
import type { TimeUnit } from '../units'

export const SCHEMA_VERSION = 1
export const DEFAULT_RPM = 256

export interface Settings {
  rpm: number
  timeUnit: TimeUnit
  /** Items per stack for machines that take stacks (fans, crushing wheels); absent = 1. */
  stackSize?: number
}

export const MAX_STACK_SIZE = 64

export interface Position {
  x: number
  y: number
}

export interface RecipeNode {
  id: string
  kind: 'recipe'
  recipeId: string
  machineId: MachineId
  /** Overrides Settings.rpm. */
  rpm?: number
  /** Overrides Settings.stackSize. */
  stackSize?: number
  parallelStacks?: number
  /** Fixes this node's production of one output item (per minute). */
  target?: { item: string; perMinute: number }
  /** Fuel for the Blaze Burners or furnace; defaults per heat level (core/fuels.ts). */
  fuel?: string
  position: Position
}

export interface SourceNode {
  id: string
  kind: 'source'
  item: string
  /** null = unlimited, takes whatever is demanded. */
  perMinute: number | null
  /** Generated items only: mined by drills on a generator. Defaults to on. */
  drill?: boolean
  /** Drill RPM, overrides Settings.rpm. */
  rpm?: number
  position: Position
}

export type PowerSourceId =
  | 'water_wheel'
  | 'large_water_wheel'
  | 'windmill'
  | 'hand_crank'
  | 'creative_motor'
  | 'steam_engine'

/** Supplies stress to the whole plan; it has no ports. */
export interface PowerNode {
  id: string
  kind: 'power'
  source: PowerSourceId
  /** Units built (steam engine: engines). Absent = enough to cover the remaining stress. */
  count?: number
  /** Windmill: sail blocks. */
  sails?: number
  /** Creative motor: its set speed; steam engine: speed of the boiler's water pumps. */
  rpm?: number
  position: Position
}

export type PlanNode = RecipeNode | SourceNode | PowerNode

/** How an edge is built. Absent = ideal, without a limit. */
export interface Transport {
  type: 'belt' | 'chute' | 'pipe'
  /** Belt or pump speed, overrides Settings.rpm. */
  rpm?: number
  /** Belts and chutes: items per entry (1 = single items, up to 64 with a brass funnel). */
  itemsPerEntry?: number
}

/** Carries one item from an output port of `source` to an input port of `target`. */
export interface PlanEdge {
  id: string
  source: string
  target: string
  item: string
  /** The input port, when it is a tag the item belongs to. */
  targetItem?: string
  transport?: Transport
}

/** The resource of the input port an edge feeds. */
export const targetPortOf = (edge: PlanEdge) => edge.targetItem ?? edge.item

/** Addon recipes the plan uses, so it still works without their packs (core/model/addons.ts). */
export interface AddonRecipes {
  /** Name and version of each pack by pack id. */
  packs: Record<string, { name: string; version: string }>
  recipes: Recipe[]
  /** Pack id of every recipe. */
  recipePack: Record<string, string>
  /** Addon items, fluids and tags the recipes use (base ones are left out). */
  items: Record<ResourceId, ItemInfo>
  /** Members of the addon tags the recipes use. */
  tags: Record<ResourceId, ResourceId[]>
  /** PNG icons as data URIs; left out of share links. */
  icons?: Record<ResourceId, string>
}

export interface Plan {
  schemaVersion: typeof SCHEMA_VERSION
  settings: Settings
  nodes: PlanNode[]
  edges: PlanEdge[]
  addons?: AddonRecipes
}

export function emptyPlan(): Plan {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { rpm: DEFAULT_RPM, timeUnit: 'minute' },
    nodes: [],
    edges: [],
  }
}
