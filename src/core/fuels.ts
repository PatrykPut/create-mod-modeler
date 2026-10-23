// Fuels for Blaze Burners and vanilla furnaces.
// Sources: vanilla AbstractFurnaceBlockEntity / NeoForge furnace_fuels data map (burn times),
// Create content/processing/burner/BlazeBurnerBlockEntity.java (tryUpdateFuel),
// data map create:superheated_blaze_burner_fuels.
import type { HeatRequirement, ResourceId } from '../data/types'

export interface Fuel {
  item: ResourceId
  /** Ticks one item burns. A Blaze Burner uses any furnace fuel at its full burn time. */
  burnTime: number
  /** Item left behind after burning. */
  remainder?: ResourceId
  /** Blaze Burners: only superheating fuels make a burner seething. */
  superheats?: boolean
}

export const FUELS: Fuel[] = [
  { item: 'minecraft:coal', burnTime: 1600 },
  { item: 'minecraft:charcoal', burnTime: 1600 },
  { item: 'minecraft:coal_block', burnTime: 16000 },
  { item: 'minecraft:blaze_rod', burnTime: 2400 },
  { item: 'minecraft:dried_kelp_block', burnTime: 4001 },
  {
    item: 'minecraft:lava_bucket',
    burnTime: 20000,
    remainder: 'minecraft:bucket',
  },
  { item: '#minecraft:planks', burnTime: 300 },
  { item: '#minecraft:logs_that_burn', burnTime: 300 },
  // burns 3200 ticks superheated in a Blaze Burner, 6400 in a furnace
  { item: 'create:blaze_cake', burnTime: 3200, superheats: true },
]

export const DEFAULT_FUEL: Record<HeatRequirement | 'furnace', ResourceId> = {
  heated: 'minecraft:coal',
  superheated: 'create:blaze_cake',
  furnace: 'minecraft:coal',
}

const FURNACE_BURN_TIME_OVERRIDES: Record<ResourceId, number> = {
  'create:blaze_cake': 6400,
}

/** Fuels a Blaze Burner can reach the given heat with. */
export function burnerFuels(heat: HeatRequirement): Fuel[] {
  return heat === 'superheated' ? FUELS.filter((f) => f.superheats) : FUELS
}

export function fuelFor(item: ResourceId, furnace = false): Fuel | undefined {
  const fuel = FUELS.find((f) => f.item === item)
  if (!fuel) return undefined
  const override = furnace ? FURNACE_BURN_TIME_OVERRIDES[item] : undefined
  return override ? { ...fuel, burnTime: override } : fuel
}
