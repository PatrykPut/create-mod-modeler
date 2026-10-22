import type { Recipe, RecipeType } from '../data/types'
import { crushingCycleTicks } from './formulas/crushing'
import { fanCycleTicks } from './formulas/fan'
import { millstoneCycleTicks } from './formulas/millstone'
import { pressCycleTicks } from './formulas/press'
import { perMinuteFromTicks } from './units'

export type MachineId =
  | 'crushing_wheels'
  | 'millstone'
  | 'fan_washing'
  | 'mechanical_press'
  | 'press_basin'

export interface MachineConditions {
  rpm: number
  /** Items per stack fed into the machine. */
  stackSize: number
  /** Fans only: stacks inside the air current at the same time. */
  parallelStacks: number
}

export interface MachineDef {
  id: MachineId
  name: string
  /** SU per RPM for one machine unit (a crushing unit is two wheels). Source: AllBlocks.java. */
  stressImpact: number
  usesRpm: boolean
  usesStackSize: boolean
  usesParallelStacks: boolean
  /** Assumption shown to the user next to the numbers. */
  note?: string
  /** Recipe executions per minute for one machine unit. */
  runsPerMinute(recipe: Recipe, conditions: MachineConditions): number
}

// Default processing time when a recipe has none (CrushingWheelControllerBlockEntity.itemInserted,
// MillstoneBlockEntity.tick).
const DEFAULT_PROCESSING_TIME = 100

export const MACHINES: Record<MachineId, MachineDef> = {
  crushing_wheels: {
    id: 'crushing_wheels',
    name: 'Crushing Wheels',
    stressImpact: 2 * 8,
    usesRpm: true,
    usesStackSize: true,
    usesParallelStacks: false,
    note: 'One unit is a pair of wheels (2 × 8 SU/RPM).',
    runsPerMinute: (recipe, { rpm, stackSize }) =>
      stackSize *
      perMinuteFromTicks(
        crushingCycleTicks(
          recipe.processingTime ?? DEFAULT_PROCESSING_TIME,
          rpm,
          stackSize,
        ),
      ),
  },
  millstone: {
    id: 'millstone',
    name: 'Millstone',
    stressImpact: 4,
    usesRpm: true,
    usesStackSize: false,
    usesParallelStacks: false,
    runsPerMinute: (recipe, { rpm }) =>
      perMinuteFromTicks(
        millstoneCycleTicks(
          recipe.processingTime ?? DEFAULT_PROCESSING_TIME,
          rpm,
        ),
      ),
  },
  fan_washing: {
    id: 'fan_washing',
    name: 'Encased Fan (Washing)',
    stressImpact: 2,
    usesRpm: false,
    usesStackSize: true,
    usesParallelStacks: true,
    note: 'Processing time does not depend on RPM. Set how many stacks sit in the air current at once (depot = 1, one per belt block in range).',
    runsPerMinute: (_recipe, { stackSize, parallelStacks }) =>
      stackSize * parallelStacks * perMinuteFromTicks(fanCycleTicks(stackSize)),
  },
  mechanical_press: {
    id: 'mechanical_press',
    name: 'Mechanical Press',
    stressImpact: 8,
    usesRpm: true,
    usesStackSize: false,
    usesParallelStacks: false,
    note: 'One item per stroke (bulkPressing is off by default).',
    runsPerMinute: (_recipe, { rpm }) =>
      perMinuteFromTicks(pressCycleTicks(rpm)),
  },
  press_basin: {
    id: 'press_basin',
    name: 'Mechanical Press + Basin',
    stressImpact: 8,
    usesRpm: true,
    usesStackSize: false,
    usesParallelStacks: false,
    note: 'One recipe per stroke.',
    runsPerMinute: (_recipe, { rpm }) =>
      perMinuteFromTicks(pressCycleTicks(rpm)),
  },
}

export const MACHINES_BY_TYPE: Record<RecipeType, MachineId[]> = {
  crushing: ['crushing_wheels'],
  milling: ['millstone', 'crushing_wheels'],
  splashing: ['fan_washing'],
  pressing: ['mechanical_press'],
  compacting: ['press_basin'],
}
