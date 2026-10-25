import { describe, expect, it } from 'vitest'
import { bucketRecipes, createNormalizer } from './normalize.ts'
import { TagIndex } from './tags.ts'

function setup() {
  const tags = new TagIndex((id) => /^(minecraft|create):/.test(id))
  tags.add('item', 'c:ingots/copper', { values: ['minecraft:copper_ingot'] })
  tags.add('item', 'c:ingots/zinc', { values: ['create:zinc_ingot'] })
  tags.add('item', 'minecraft:planks', {
    values: ['minecraft:oak_planks', 'minecraft:spruce_planks'],
  })
  tags.add('item', 'c:empty', {
    values: [{ id: 'othermod:x', required: false }],
  })
  tags.add('fluid', 'c:milk', {
    values: [
      { id: 'minecraft:milk', required: false },
      { id: 'minecraft:flowing_milk', required: false },
    ],
  })
  return createNormalizer(tags)
}

describe('createRecipe', () => {
  it('reads inputs, chance outputs and processing time', () => {
    const recipe = setup().createRecipe('create:splashing/gravel', {
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
    const recipe = setup().createRecipe('create:milling/cobblestone', {
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
    const recipe = setup().createRecipe('create:compacting/ice', {
      type: 'create:compacting',
      ingredients: Array(9).fill({ item: 'minecraft:snow_block' }),
      results: [{ id: 'minecraft:ice' }],
    })
    expect(recipe?.inputs).toEqual([
      { item: 'minecraft:snow_block', amount: 9 },
    ])
  })

  it('resolves single-member tags to their item and keeps heat', () => {
    const recipe = setup().createRecipe('create:mixing/brass_ingot', {
      type: 'create:mixing',
      heat_requirement: 'heated',
      ingredients: [{ tag: 'c:ingots/copper' }, { tag: 'c:ingots/zinc' }],
      results: [{ count: 2, id: 'create:brass_ingot' }],
    })
    expect(recipe).toMatchObject({
      heat: 'heated',
      inputs: [
        { item: 'minecraft:copper_ingot', amount: 1 },
        { item: 'create:zinc_ingot', amount: 1 },
      ],
    })
  })

  it('keeps multi-member tags as tag resources and records their members', () => {
    const normalizer = setup()
    const recipe = normalizer.createRecipe('create:deploying/cogwheel', {
      type: 'create:deploying',
      ingredients: [{ item: 'create:shaft' }, { tag: 'minecraft:planks' }],
      results: [{ id: 'create:cogwheel' }],
    })
    expect(recipe?.inputs).toEqual([
      { item: 'create:shaft', amount: 1 },
      { item: '#minecraft:planks', amount: 1 },
    ])
    expect(normalizer.tags.get('#minecraft:planks')).toEqual([
      'minecraft:oak_planks',
      'minecraft:spruce_planks',
    ])
  })

  it('reads fluid ingredients and results in mB', () => {
    const recipe = setup().createRecipe('create:mixing/chocolate', {
      type: 'create:mixing',
      heat_requirement: 'heated',
      ingredients: [
        { item: 'minecraft:sugar' },
        { type: 'neoforge:tag', amount: 250, tag: 'c:milk' },
      ],
      results: [{ amount: 250, id: 'create:chocolate' }],
    })
    expect(recipe?.inputs).toEqual([
      { item: 'minecraft:sugar', amount: 1 },
      // flowing variants are not separate resources
      { item: 'fluid:minecraft:milk', amount: 250 },
    ])
    expect(recipe?.outputs).toEqual([
      { item: 'fluid:create:chocolate', amount: 250, chance: 1 },
    ])
    expect(
      setup().createRecipe('create:filling/blaze_cake', {
        type: 'create:filling',
        ingredients: [
          { item: 'create:blaze_cake_base' },
          { type: 'neoforge:single', amount: 250, fluid: 'minecraft:lava' },
        ],
        results: [{ id: 'create:blaze_cake' }],
      })?.inputs[1],
    ).toEqual({ item: 'fluid:minecraft:lava', amount: 250 })
  })

  it('reads the deprecated fluid ingredient and item result formats', () => {
    const recipe = setup().createRecipe(
      'create_copper_and_zinc:mixing_asurine',
      {
        type: 'create:mixing',
        ingredients: [
          { item: 'minecraft:clay_ball' },
          { item: 'minecraft:clay_ball' },
          { type: 'fluid_stack', amount: 250, fluid: 'minecraft:water' },
          { type: 'fluid_tag', amount: 100, fluid_tag: 'c:milk' },
        ],
        results: [
          { item: { id: 'create:asurine' } },
          { item: { id: 'minecraft:flint', count: 2 }, chance: 0.5 },
        ],
      },
    )
    expect(recipe?.inputs).toEqual([
      { item: 'minecraft:clay_ball', amount: 2 },
      { item: 'fluid:minecraft:water', amount: 250 },
      { item: 'fluid:minecraft:milk', amount: 100 },
    ])
    expect(recipe?.outputs).toEqual([
      { item: 'create:asurine', amount: 1, chance: 1 },
      { item: 'minecraft:flint', amount: 2, chance: 0.5 },
    ])
  })

  it('splits off a deployer tool that is kept', () => {
    const recipe = setup().createRecipe('create:deploying/copper_from_waxed', {
      type: 'create:deploying',
      ingredients: [
        { item: 'minecraft:waxed_copper_block' },
        { item: 'minecraft:iron_axe' },
      ],
      keep_held_item: true,
      results: [{ id: 'minecraft:copper_block' }],
    })
    expect(recipe?.inputs).toEqual([
      { item: 'minecraft:waxed_copper_block', amount: 1 },
    ])
    expect(recipe?.tool).toBe('minecraft:iron_axe')
  })

  it('counts mechanical crafting grid cells', () => {
    const recipe = setup().createRecipe(
      'create:mechanical_crafting/crushing_wheel',
      {
        type: 'create:mechanical_crafting',
        key: {
          A: { item: 'create:andesite_alloy' },
          P: { tag: 'minecraft:planks' },
        },
        pattern: [' AAA ', 'AAPAA', ' AAA '],
        result: { count: 2, id: 'create:crushing_wheel' },
      },
    )
    expect(recipe).toMatchObject({
      type: 'mechanical_crafting',
      gridSize: 11,
      inputs: [
        { item: 'create:andesite_alloy', amount: 10 },
        { item: '#minecraft:planks', amount: 1 },
      ],
      outputs: [{ item: 'create:crushing_wheel', amount: 2, chance: 1 }],
    })
  })

  it('skips recipes for other mods and unknown types', () => {
    const n = setup()
    expect(
      n.createRecipe('create:crushing/compat/x', {
        'neoforge:conditions': [{ type: 'neoforge:mod_loaded', modid: 'x' }],
        type: 'create:crushing',
        ingredients: [{ item: 'minecraft:sand' }],
        results: [{ id: 'x:dust' }],
      }),
    ).toBeUndefined()
    expect(
      n.createRecipe('create:crushing/empty_tag', {
        type: 'create:crushing',
        ingredients: [{ tag: 'c:empty' }],
        results: [{ id: 'minecraft:sand' }],
      }),
    ).toBeUndefined()
    expect(
      n.createRecipe('create:sequenced_assembly/x', {
        type: 'create:sequenced_assembly',
        ingredient: { item: 'x:a' },
        results: [{ id: 'x:out' }],
      }),
    ).toBeUndefined()
  })
})

describe('vanillaRecipes', () => {
  it('turns a full 3×3 crafting recipe of one item into compacting', () => {
    const [recipe] = setup().vanillaRecipes(
      'minecraft:iron_ingot_from_nuggets',
      {
        type: 'minecraft:crafting_shaped',
        key: { '#': { item: 'minecraft:iron_nugget' } },
        pattern: ['###', '###', '###'],
        result: { count: 1, id: 'minecraft:iron_ingot' },
      },
    )
    expect(recipe).toEqual({
      id: 'minecraft:iron_ingot_from_nuggets',
      type: 'compacting',
      inputs: [{ item: 'minecraft:iron_nugget', amount: 9 }],
      outputs: [{ item: 'minecraft:iron_ingot', amount: 1, chance: 1 }],
      derivedFrom: 'crafting',
    })
  })

  it('rejects crafting recipes the press would not compress', () => {
    const n = setup()
    expect(
      n
        .vanillaRecipes('x:gap', {
          type: 'minecraft:crafting_shaped',
          key: { '#': { item: 'minecraft:stone' } },
          pattern: ['###', '# #', '###'],
          result: { id: 'minecraft:furnace' },
        })
        .filter((r) => r.type === 'compacting'),
    ).toEqual([])
    expect(
      n.vanillaRecipes('x:block_manual_only', {
        type: 'minecraft:crafting_shapeless',
        ingredients: Array(9).fill({ item: 'minecraft:stone' }),
        result: { id: 'minecraft:stone' },
      }),
    ).toEqual([])
  })

  it('runs other shapeless crafting recipes in the mixer', () => {
    const n = setup()
    expect(
      n.vanillaRecipes('minecraft:pumpkin_pie', {
        type: 'minecraft:crafting_shapeless',
        ingredients: [
          { item: 'minecraft:pumpkin' },
          { item: 'minecraft:sugar' },
          { item: 'minecraft:egg' },
        ],
        result: { id: 'minecraft:pumpkin_pie' },
      }),
    ).toEqual([
      {
        id: 'minecraft:pumpkin_pie',
        type: 'mixing',
        inputs: [
          { item: 'minecraft:pumpkin', amount: 1 },
          { item: 'minecraft:sugar', amount: 1 },
          { item: 'minecraft:egg', amount: 1 },
        ],
        outputs: [{ item: 'minecraft:pumpkin_pie', amount: 1, chance: 1 }],
        derivedFrom: 'crafting',
      },
    ])
    // a single ingredient is not mixed
    expect(
      n.vanillaRecipes('minecraft:sugar_from_sugar_cane', {
        type: 'minecraft:crafting_shapeless',
        ingredients: [{ item: 'minecraft:sugar_cane' }],
        result: { id: 'minecraft:sugar' },
      }),
    ).toEqual([])
  })

  it('keeps cooking recipes with their cooking time', () => {
    expect(
      setup().vanillaRecipes('minecraft:iron_ingot_from_blasting_raw_iron', {
        type: 'minecraft:blasting',
        ingredient: { item: 'minecraft:raw_iron' },
        cookingtime: 100,
        result: { id: 'minecraft:iron_ingot' },
      }),
    ).toEqual([
      {
        id: 'minecraft:iron_ingot_from_blasting_raw_iron',
        type: 'blasting',
        inputs: [{ item: 'minecraft:raw_iron', amount: 1 }],
        outputs: [{ item: 'minecraft:iron_ingot', amount: 1, chance: 1 }],
        processingTime: 100,
      },
    ])
  })

  it('turns alternative ingredients into a synthetic tag', () => {
    const n = setup()
    const [recipe] = n.vanillaRecipes('minecraft:charcoal', {
      type: 'minecraft:smelting',
      ingredient: [
        { item: 'minecraft:oak_log' },
        { item: 'minecraft:birch_log' },
      ],
      cookingtime: 200,
      result: { id: 'minecraft:charcoal' },
    })
    expect(recipe.inputs[0].item).toBe('#minecraft:charcoal/input')
    expect(n.tags.get('#minecraft:charcoal/input')).toEqual([
      'minecraft:oak_log',
      'minecraft:birch_log',
    ])
  })

  it('derives saw cutting from stonecutting', () => {
    expect(
      setup().vanillaRecipes('minecraft:stone_slab_from_stone_stonecutting', {
        type: 'minecraft:stonecutting',
        ingredient: { item: 'minecraft:stone' },
        result: { count: 2, id: 'minecraft:stone_slab' },
      }),
    ).toEqual([
      {
        id: 'minecraft:stone_slab_from_stone_stonecutting',
        type: 'cutting',
        inputs: [{ item: 'minecraft:stone', amount: 1 }],
        outputs: [{ item: 'minecraft:stone_slab', amount: 2, chance: 1 }],
        derivedFrom: 'stonecutting',
      },
    ])
  })
})

describe('bucketRecipes', () => {
  it('fills and empties a bucket with 1000 mB', () => {
    const [filling, emptying] = bucketRecipes(
      'minecraft:lava',
      'minecraft:lava_bucket',
    )
    expect(filling).toMatchObject({
      type: 'filling',
      inputs: [
        { item: 'minecraft:bucket', amount: 1 },
        { item: 'fluid:minecraft:lava', amount: 1000 },
      ],
      outputs: [{ item: 'minecraft:lava_bucket', amount: 1, chance: 1 }],
    })
    expect(emptying).toMatchObject({
      type: 'emptying',
      inputs: [{ item: 'minecraft:lava_bucket', amount: 1 }],
      outputs: [
        { item: 'minecraft:bucket', amount: 1, chance: 1 },
        { item: 'fluid:minecraft:lava', amount: 1000, chance: 1 },
      ],
    })
  })
})

describe('vanillaRecipes conditions', () => {
  it('skips vanilla-type recipes that need another mod', () => {
    expect(
      setup().vanillaRecipes('create:smelting/ingot_x', {
        'neoforge:conditions': [{ type: 'neoforge:mod_loaded', modid: 'x' }],
        type: 'minecraft:smelting',
        ingredient: { item: 'minecraft:stone' },
        cookingtime: 200,
        result: { id: 'minecraft:stone' },
      }),
    ).toEqual([])
  })
})
