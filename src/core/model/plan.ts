import type { MachineId } from '../machines'
import type { TimeUnit } from '../units'

export const SCHEMA_VERSION = 1
export const DEFAULT_RPM = 256

export interface Settings {
  rpm: number
  timeUnit: TimeUnit
}

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

export type PlanNode = RecipeNode | SourceNode

/** Carries one item from an output port of `source` to an input port of `target`. */
export interface PlanEdge {
  id: string
  source: string
  target: string
  item: string
  /** The input port, when it is a tag the item belongs to. */
  targetItem?: string
}

/** The resource of the input port an edge feeds. */
export const targetPortOf = (edge: PlanEdge) => edge.targetItem ?? edge.item

export interface Plan {
  schemaVersion: typeof SCHEMA_VERSION
  settings: Settings
  nodes: PlanNode[]
  edges: PlanEdge[]
}

export function emptyPlan(): Plan {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { rpm: DEFAULT_RPM, timeUnit: 'minute' },
    nodes: [],
    edges: [],
  }
}
