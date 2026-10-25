import { describe, expect, it } from 'vitest'
import type { Recipe } from '../data/types'
import { MACHINES, recipeMachineName } from './machines'

const ending: Recipe = {
  id: 'create_dragons_plus:ending/end_stone_from_cobblestone',
  type: 'fan_processing',
  inputs: [{ item: 'minecraft:cobblestone', amount: 1 }],
  outputs: [{ item: 'minecraft:end_stone', amount: 1, chance: 1 }],
  fan: { mode: 'Ending', catalyst: 'Dragon Head or Dragon Breath' },
}
const conditions = { rpm: 64, stackSize: 16, parallelStacks: 2 }

describe('addon fan', () => {
  it('processes as fast as the fans of Create', () => {
    expect(MACHINES.fan_addon.runsPerMinute(ending, conditions)).toBe(
      MACHINES.fan_washing.runsPerMinute(ending, conditions),
    )
  })

  it('is named after the processing mode of the recipe', () => {
    expect(recipeMachineName('fan_addon', ending)).toBe('Encased Fan (Ending)')
    expect(recipeMachineName('fan_washing', ending)).toBe(
      'Encased Fan (Washing)',
    )
  })
})
