import type { Recipe, RecipeType } from '../data/types'
import type { MachineBlock } from './blocks'
import { crafterCycleTicks } from './formulas/crafter'
import { crushingCycleTicks } from './formulas/crushing'
import { deployerCycleTicks } from './formulas/deployer'
import { drillCycleTicks } from './formulas/drill'
import { fanCycleTicks } from './formulas/fan'
import { millstoneCycleTicks } from './formulas/millstone'
import { MIXER_MIN_RPM, mixerCycleTicks } from './formulas/mixer'
import { pressCycleTicks } from './formulas/press'
import { sawCycleTicks } from './formulas/saw'
import type { PowerSourceId } from './model/plan'
import { perMinuteFromTicks } from './units'

export type MachineId =
  | 'crushing_wheels'
  | 'millstone'
  | 'fan_washing'
  | 'fan_haunting'
  | 'fan_smoking'
  | 'fan_blasting'
  | 'fan_addon'
  | 'mechanical_press'
  | 'press_basin'
  | 'mixer'
  | 'mechanical_saw'
  | 'deployer'
  | 'spout'
  | 'item_drain'
  | 'mechanical_crafter'
  | 'furnace'
  | 'blast_furnace'
  | 'smoker'

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
  /** Block shown as the machine's icon. */
  block: MachineBlock
  /** SU per RPM for one block (a crushing unit counts as one block of 2 × 8). Source: AllBlocks.java. */
  stressImpact: number
  /** Blocks in one machine unit, e.g. one crafter per grid cell. Defaults to 1. */
  blocksPerUnit?: (recipe: Recipe) => number
  usesRpm: boolean
  usesStackSize: boolean
  usesParallelStacks: boolean
  /** Below this speed the machine does not run. */
  minRpm?: number
  /** Runs on a basin: heated recipes need a Blaze Burner under each basin. */
  basin?: boolean
  /** Vanilla furnaces: fuel burn time (ticks) used per recipe execution. */
  fuelTicksPerRun?: (recipe: Recipe) => number
  /** Assumption shown to the user next to the numbers. */
  note?: string
  /** Recipe executions per minute for one machine unit. */
  runsPerMinute(recipe: Recipe, conditions: MachineConditions): number
}

// Default processing time when a recipe has none (CrushingWheelControllerBlockEntity.itemInserted,
// MillstoneBlockEntity.tick).
const DEFAULT_PROCESSING_TIME = 100
// SawBlockEntity.start: stonecutting recipes have no duration of their own
const STONECUTTING_TIME = 50
// SpoutBlockEntity: FILLING_TIME 20, filled at 5, next item from -1
const SPOUT_TICKS = 21
// ItemDrainBlockEntity.tick: moves to the centre (4), drains (20), moves out (5)
const ITEM_DRAIN_TICKS = 29
// vanilla AbstractFurnaceBlockEntity: default cooking times
const SMELTING_TIME = 200
const FAST_COOKING_TIME = 100

// Source: content/kinetics/fan/processing/AllFanProcessingTypes.java
function fan(id: MachineId, mode: string, note: string): MachineDef {
  return {
    id,
    name: `Encased Fan (${mode})`,
    block: 'create:encased_fan',
    stressImpact: 2,
    usesRpm: false,
    usesStackSize: true,
    usesParallelStacks: true,
    note: `${note} Processing time does not depend on RPM. Set how many stacks sit in the air current at once (depot = 1, one per belt block in range).`,
    runsPerMinute: (_recipe, { stackSize, parallelStacks }) =>
      stackSize * parallelStacks * perMinuteFromTicks(fanCycleTicks(stackSize)),
  }
}

// Source: vanilla AbstractFurnaceBlockEntity (serverTick); blast furnace and smoker halve
// the burn duration of their fuel (BlastFurnaceBlockEntity / SmokerBlockEntity.getBurnDuration).
function furnace(
  id: 'furnace' | 'blast_furnace' | 'smoker',
  name: string,
  defaultTime: number,
  burnSpeed: number,
): MachineDef {
  return {
    id,
    name,
    block: `minecraft:${id}`,
    stressImpact: 0,
    usesRpm: false,
    usesStackSize: false,
    usesParallelStacks: false,
    fuelTicksPerRun: (recipe) =>
      (recipe.processingTime ?? defaultTime) * burnSpeed,
    note: 'Vanilla block, no stress. Burns fuel only while cooking.',
    runsPerMinute: (recipe) =>
      perMinuteFromTicks(recipe.processingTime ?? defaultTime),
  }
}

export const MACHINES: Record<MachineId, MachineDef> = {
  crushing_wheels: {
    id: 'crushing_wheels',
    name: 'Crushing Wheels',
    block: 'create:crushing_wheel',
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
    block: 'create:millstone',
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
  fan_washing: fan('fan_washing', 'Washing', 'Air passes through water.'),
  fan_haunting: fan(
    'fan_haunting',
    'Haunting',
    'Air passes through soul fire.',
  ),
  fan_smoking: fan('fan_smoking', 'Smoking', 'Air passes through fire.'),
  fan_blasting: fan(
    'fan_blasting',
    'Blasting',
    'Air passes through lava. Runs smelting recipes, blasting ones only for items without a smelting recipe; food burns.',
  ),
  // addon fan processing types run on Create's fan timer as well (packs/fans.ts)
  fan_addon: fan(
    'fan_addon',
    'Addon',
    "Fan processing of an addon: air passes through the recipe's catalyst.",
  ),
  mechanical_press: {
    id: 'mechanical_press',
    name: 'Mechanical Press',
    block: 'create:mechanical_press',
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
    block: 'create:mechanical_press',
    stressImpact: 8,
    usesRpm: true,
    usesStackSize: false,
    usesParallelStacks: false,
    basin: true,
    note: 'One recipe per stroke.',
    runsPerMinute: (_recipe, { rpm }) =>
      perMinuteFromTicks(pressCycleTicks(rpm)),
  },
  mixer: {
    id: 'mixer',
    name: 'Mechanical Mixer + Basin',
    block: 'create:mechanical_mixer',
    stressImpact: 4,
    usesRpm: true,
    usesStackSize: false,
    usesParallelStacks: false,
    minRpm: MIXER_MIN_RPM,
    basin: true,
    note: `One recipe per mixing cycle, assuming the basin always holds the ingredients and its output is taken away. Needs at least ${MIXER_MIN_RPM} RPM.`,
    runsPerMinute: (recipe, { rpm }) =>
      perMinuteFromTicks(mixerCycleTicks(recipe.processingTime, rpm)),
  },
  mechanical_saw: {
    id: 'mechanical_saw',
    name: 'Mechanical Saw',
    block: 'create:mechanical_saw',
    stressImpact: 4,
    usesRpm: true,
    usesStackSize: false,
    usesParallelStacks: false,
    note: 'Facing up, fed one item at a time by a belt. When several recipes match, the saw alternates between them unless it has a filter.',
    runsPerMinute: (recipe, { rpm }) =>
      perMinuteFromTicks(
        sawCycleTicks(
          recipe.processingTime ??
            (recipe.derivedFrom === 'stonecutting' ? STONECUTTING_TIME : 0),
          rpm,
        ),
      ),
  },
  deployer: {
    id: 'deployer',
    name: 'Deployer',
    block: 'create:deployer',
    stressImpact: 4,
    usesRpm: true,
    usesStackSize: false,
    usesParallelStacks: false,
    note: 'Over a belt or depot, one item per activation. Sandpaper lasts 8 uses.',
    runsPerMinute: (_recipe, { rpm }) =>
      perMinuteFromTicks(deployerCycleTicks(rpm)),
  },
  spout: {
    id: 'spout',
    name: 'Spout',
    block: 'create:spout',
    stressImpact: 0,
    usesRpm: false,
    usesStackSize: false,
    usesParallelStacks: false,
    note: 'Not kinetic, no stress. One item at a time.',
    runsPerMinute: () => perMinuteFromTicks(SPOUT_TICKS),
  },
  item_drain: {
    id: 'item_drain',
    name: 'Item Drain',
    block: 'create:item_drain',
    stressImpact: 0,
    usesRpm: false,
    usesStackSize: false,
    usesParallelStacks: false,
    note: 'Not kinetic, no stress. One item at a time, fed from the side.',
    runsPerMinute: () => perMinuteFromTicks(ITEM_DRAIN_TICKS),
  },
  mechanical_crafter: {
    id: 'mechanical_crafter',
    name: 'Mechanical Crafter',
    block: 'create:mechanical_crafter',
    stressImpact: 2,
    blocksPerUnit: (recipe) => recipe.gridSize ?? 1,
    usesRpm: true,
    usesStackSize: false,
    usesParallelStacks: false,
    note: 'Approximation: one unit is a grid with one crafter per ingredient, chained in a single line; refilling the grid is not counted.',
    runsPerMinute: (recipe, { rpm }) =>
      perMinuteFromTicks(crafterCycleTicks(recipe.gridSize ?? 1, rpm)),
  },
  furnace: furnace('furnace', 'Furnace', SMELTING_TIME, 1),
  blast_furnace: furnace(
    'blast_furnace',
    'Blast Furnace',
    FAST_COOKING_TIME,
    2,
  ),
  smoker: furnace('smoker', 'Smoker', FAST_COOKING_TIME, 2),
}

export const MACHINES_BY_TYPE: Record<RecipeType, MachineId[]> = {
  crushing: ['crushing_wheels'],
  milling: ['millstone', 'crushing_wheels'],
  splashing: ['fan_washing'],
  haunting: ['fan_haunting'],
  pressing: ['mechanical_press'],
  compacting: ['press_basin'],
  mixing: ['mixer'],
  cutting: ['mechanical_saw'],
  deploying: ['deployer'],
  item_application: ['deployer'],
  sandpaper_polishing: ['deployer'],
  filling: ['spout'],
  emptying: ['item_drain'],
  mechanical_crafting: ['mechanical_crafter'],
  smelting: ['fan_blasting', 'furnace'],
  blasting: ['blast_furnace', 'fan_blasting'],
  smoking: ['fan_smoking', 'smoker'],
  fan_processing: ['fan_addon'],
}

/** Name of a machine running a recipe; the addon fan is named after the recipe's mode. */
export const recipeMachineName = (id: MachineId, recipe: Recipe): string =>
  id === 'fan_addon' && recipe.fan
    ? `Encased Fan (${recipe.fan.mode})`
    : MACHINES[id].name

/**
 * Blocks a fluid generator makes that a drill can mine with CobbleGenOptimisation,
 * keyed by the dropped item. Hardness from vanilla.
 */
export const GENERATED_BLOCKS: Record<string, { hardness: number }> = {
  'minecraft:cobblestone': { hardness: 2 },
  'minecraft:basalt': { hardness: 1.25 },
  // lava meeting flowing honey / chocolate (AllFluids.registerFluidInteractions);
  // properties copied from sandstone / blackstone (AllPaletteStoneTypes)
  'create:limestone': { hardness: 0.8 },
  'create:scoria': { hardness: 1.5 },
}

export const DRILL = {
  id: 'mechanical_drill',
  name: 'Mechanical Drill',
  block: 'create:mechanical_drill',
  stressImpact: 4,
  note: 'Assumes an optimised generator: a belt, hopper or chute right next to the generated block takes the drops, so nothing has to regrow.',
  /** Blocks per minute for one drill, or undefined if the item cannot be generated. */
  blocksPerMinute(item: string, rpm: number): number | undefined {
    const block = GENERATED_BLOCKS[item]
    return block && perMinuteFromTicks(drillCycleTicks(block.hardness, rpm))
  },
} as const

export const BLAZE_BURNER = {
  id: 'blaze_burner',
  name: 'Blaze Burner',
  block: 'create:blaze_burner',
} as const

/** Pipes and boiler water supply: 4 SU/RPM (AllBlocks.java). */
export const PUMP = {
  id: 'mechanical_pump',
  name: 'Mechanical Pump',
  block: 'create:mechanical_pump',
  stressImpact: 4,
} as const

/** Anything that is counted in the machine list. */
export type BuiltMachineId =
  | MachineId
  | PowerSourceId
  | typeof DRILL.id
  | typeof BLAZE_BURNER.id
  | typeof PUMP.id
