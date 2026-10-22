import { describe, expect, it } from 'vitest'
import { deriveCompacting, normalizeCreateRecipe } from './normalize.ts'

describe('normalizeCreateRecipe', () => {
  it('reads inputs, chance outputs and processing time', () => {
    const recipe = normalizeCreateRecipe('create:splashing/gravel', {
      type: 'create:splashing',
      ingredients: [{ item: 'minecraft:gravel' }],
      results: [
        { chance: 0.25, id: 'minecraft:flint' },
        { chance: 0.125, id: 'minecraft:iron_nugget' },
      ],
    })
    expect(recipe).toEqual({
      id: 'create:splashing/gravel',
      type: 'splashing',
      inputs: [{ item: 'minecraft:gravel', amount: 1 }],
      outputs: [
        { item: 'minecraft:flint', amount: 1, chance: 0.25 },
        { item: 'minecraft:iron_nugget', amount: 1, chance: 0.125 },
      ],
    })
  })

  it('keeps processing time and result counts', () => {
    const recipe = normalizeCreateRecipe('create:milling/cobblestone', {
      type: 'create:milling',
      ingredients: [{ item: 'minecraft:cobblestone' }],
      processing_time: 250,
      results: [{ id: 'minecraft:gravel', count: 2 }],
    })
    expect(recipe?.processingTime).toBe(250)
    expect(recipe?.outputs).toEqual([
      { item: 'minecraft:gravel', amount: 2, chance: 1 },
    ])
  })

  it('merges repeated ingredients into one amount', () => {
    const recipe = normalizeCreateRecipe('create:compacting/ice', {
      type: 'create:compacting',
      ingredients: Array(9).fill({ item: 'minecraft:snow_block' }),
      results: [{ id: 'minecraft:ice' }],
    })
    expect(recipe?.inputs).toEqual([
      { item: 'minecraft:snow_block', amount: 9 },
    ])
  })

  it('skips recipes that only load together with other mods', () => {
    expect(
      normalizeCreateRecipe('create:crushing/compat/exnihilosequentia/dust', {
        'neoforge:conditions': [
          { type: 'neoforge:mod_loaded', modid: 'exnihilosequentia' },
        ],
        type: 'create:crushing',
        ingredients: [{ item: 'minecraft:sand' }],
        results: [{ id: 'exnihilosequentia:dust' }],
      }),
    ).toBeUndefined()
  })

  it('skips recipes it cannot represent yet (tags, fluids, unsupported types)', () => {
    expect(
      normalizeCreateRecipe('create:compacting/blaze_cake', {
        type: 'create:compacting',
        ingredients: [{ tag: 'c:eggs' }],
        results: [{ id: 'create:blaze_cake_base' }],
      }),
    ).toBeUndefined()
    expect(
      normalizeCreateRecipe('create:compacting/chocolate', {
        type: 'create:compacting',
        ingredients: [
          { type: 'neoforge:single', amount: 250, fluid: 'create:chocolate' },
        ],
        results: [{ id: 'create:bar_of_chocolate' }],
      }),
    ).toBeUndefined()
    expect(
      normalizeCreateRecipe('create:mixing/brass', {
        type: 'create:mixing',
        ingredients: [{ item: 'minecraft:copper_ingot' }],
        results: [{ id: 'create:brass_ingot' }],
      }),
    ).toBeUndefined()
  })
})

describe('deriveCompacting', () => {
  it('turns a full 3×3 crafting recipe of one item into compacting', () => {
    const recipe = deriveCompacting('minecraft:iron_ingot_from_nuggets', {
      type: 'minecraft:crafting_shaped',
      key: { '#': { item: 'minecraft:iron_nugget' } },
      pattern: ['###', '###', '###'],
      result: { count: 1, id: 'minecraft:iron_ingot' },
    })
    expect(recipe).toEqual({
      id: 'minecraft:iron_ingot_from_nuggets',
      type: 'compacting',
      inputs: [{ item: 'minecraft:iron_nugget', amount: 9 }],
      outputs: [{ item: 'minecraft:iron_ingot', amount: 1, chance: 1 }],
      derivedFrom: 'crafting',
    })
  })

  it('accepts 2×2 shaped and 4/9 shapeless recipes of one item', () => {
    expect(
      deriveCompacting('minecraft:snow_block', {
        type: 'minecraft:crafting_shaped',
        key: { '#': { item: 'minecraft:snowball' } },
        pattern: ['##', '##'],
        result: { id: 'minecraft:snow_block' },
      })?.inputs,
    ).toEqual([{ item: 'minecraft:snowball', amount: 4 }])
    expect(
      deriveCompacting('x:shapeless', {
        type: 'minecraft:crafting_shapeless',
        ingredients: Array(9).fill({ item: 'minecraft:wheat' }),
        result: { id: 'minecraft:hay_block' },
      })?.inputs,
    ).toEqual([{ item: 'minecraft:wheat', amount: 9 }])
  })

  it('rejects everything the press would not compress', () => {
    // mixed ingredients
    expect(
      deriveCompacting('x:mixed', {
        type: 'minecraft:crafting_shaped',
        key: { a: { item: 'x:a' }, b: { item: 'x:b' } },
        pattern: ['ab', 'ba'],
        result: { id: 'x:out' },
      }),
    ).toBeUndefined()
    // gaps in the pattern
    expect(
      deriveCompacting('x:gap', {
        type: 'minecraft:crafting_shaped',
        key: { '#': { item: 'x:a' } },
        pattern: ['###', '# #', '###'],
        result: { id: 'x:out' },
      }),
    ).toBeUndefined()
    // wrong size
    expect(
      deriveCompacting('x:three', {
        type: 'minecraft:crafting_shapeless',
        ingredients: Array(3).fill({ item: 'x:a' }),
        result: { id: 'x:out' },
      }),
    ).toBeUndefined()
    // manual-only recipes are ignored in automation
    expect(
      deriveCompacting('x:block_manual_only', {
        type: 'minecraft:crafting_shapeless',
        ingredients: Array(9).fill({ item: 'x:a' }),
        result: { id: 'x:out' },
      }),
    ).toBeUndefined()
    // not a crafting recipe
    expect(
      deriveCompacting('x:smelt', {
        type: 'minecraft:smelting',
        ingredient: { item: 'x:a' },
        result: { id: 'x:out' },
      }),
    ).toBeUndefined()
  })
})
