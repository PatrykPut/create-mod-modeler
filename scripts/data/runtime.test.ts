import { describe, expect, it } from 'vitest'
import { runtimeRecipes } from './runtime.ts'

const items = new Set([
  'minecraft:oak_log',
  'minecraft:stripped_oak_log',
  'minecraft:oak_wood',
  'minecraft:stripped_oak_wood',
  'minecraft:oak_planks',
  'minecraft:oak_stairs',
  'minecraft:oak_slab',
  'minecraft:oak_sign',
  'minecraft:bamboo_block',
  'minecraft:stripped_bamboo_block',
  'minecraft:bamboo_planks',
  'minecraft:crimson_stem',
  'minecraft:stripped_crimson_stem',
  'minecraft:crimson_planks',
  'minecraft:mushroom_stem',
  'minecraft:red_concrete_powder',
  'minecraft:red_concrete',
])
const recipes = runtimeRecipes(items)
const find = (input: string, output: string) =>
  recipes.find(
    (r) => r.inputs[0].item === input && r.outputs[0].item === output,
  )

describe('runtimeRecipes', () => {
  it('strips logs and saws them into 6 planks in 50 ticks', () => {
    expect(find('minecraft:oak_log', 'minecraft:stripped_oak_log')).toEqual({
      id: 'create:runtime_generated/compat/minecraft/oak_log_to_stripped_oak_log',
      type: 'cutting',
      inputs: [{ item: 'minecraft:oak_log', amount: 1 }],
      outputs: [{ item: 'minecraft:stripped_oak_log', amount: 1, chance: 1 }],
      processingTime: 50,
      derivedFrom: 'runtime',
    })
    expect(
      find('minecraft:stripped_oak_log', 'minecraft:oak_planks')?.outputs[0]
        .amount,
    ).toBe(6)
    expect(
      find('minecraft:stripped_oak_wood', 'minecraft:oak_planks'),
    ).toBeDefined()
  })

  it('makes 3 planks from blocks and handles stems', () => {
    expect(
      find('minecraft:stripped_bamboo_block', 'minecraft:bamboo_planks')
        ?.outputs[0].amount,
    ).toBe(3)
    expect(
      find('minecraft:crimson_stem', 'minecraft:stripped_crimson_stem'),
    ).toBeDefined()
  })

  it('cuts planks into the wood set once, with slabs in pairs', () => {
    const stairs = recipes.filter(
      (r) => r.outputs[0].item === 'minecraft:oak_stairs',
    )
    expect(stairs).toHaveLength(1)
    expect(
      find('minecraft:oak_planks', 'minecraft:oak_slab')?.outputs[0].amount,
    ).toBe(2)
    expect(find('minecraft:oak_planks', 'minecraft:oak_sign')).toBeDefined()
    // no door in the registry → no recipe
    expect(
      recipes.some((r) => r.outputs[0].item === 'minecraft:oak_door'),
    ).toBe(false)
  })

  it('skips stems without planks', () => {
    expect(
      recipes.some((r) => r.inputs[0].item === 'minecraft:mushroom_stem'),
    ).toBe(false)
  })

  it('washes concrete powder into concrete', () => {
    expect(
      find('minecraft:red_concrete_powder', 'minecraft:red_concrete'),
    ).toMatchObject({
      type: 'splashing',
      derivedFrom: 'runtime',
    })
  })
})
