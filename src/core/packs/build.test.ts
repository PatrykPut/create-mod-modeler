import { describe, expect, it } from 'vitest'
import type { GameData } from '../../data/types'
import type { TagEntries } from '../gamedata/tags'
import type { PackArchive } from './archive'
import { buildPacks, mergeGameData } from './build'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

const base: GameData = {
  meta: { create: '6.0.10', minecraft: '1.21.1', createTag: 'x' },
  items: {
    'minecraft:iron_ingot': {
      id: 'minecraft:iron_ingot',
      name: 'Iron Ingot',
      icon: 'textures/minecraft/iron_ingot.png',
    },
    'create:zinc_ingot': {
      id: 'create:zinc_ingot',
      name: 'Zinc Ingot',
      icon: 'textures/create/zinc_ingot.png',
    },
    'create:crushed_raw_zinc': {
      id: 'create:crushed_raw_zinc',
      name: 'Crushed Zinc Ore',
    },
  },
  tags: {},
  recipes: [
    {
      id: 'create:crushing/raw_zinc',
      type: 'crushing',
      inputs: [{ item: 'create:raw_zinc', amount: 1 }],
      outputs: [{ item: 'create:crushed_raw_zinc', amount: 1, chance: 1 }],
    },
  ],
}

const baseTags = {
  'item:c:ingots/zinc': ['create:zinc_ingot'],
  'item:c:ingots/iron': ['minecraft:iron_ingot'],
}

function archive(parts: Partial<PackArchive>): PackArchive {
  return {
    mods: [],
    namespaces: [],
    recipes: {},
    tags: [],
    lang: {},
    models: {},
    textures: {},
    ...parts,
  }
}

const additions = archive({
  mods: [{ id: 'createaddition', name: 'Crafts & Additions', version: '1' }],
  namespaces: ['createaddition'],
  recipes: {
    'createaddition:pressing/iron_plate': {
      type: 'create:pressing',
      ingredients: [{ tag: 'c:ingots/iron' }],
      results: [{ id: 'createaddition:iron_sheet', count: 1 }],
    },
    'createaddition:mixing/alloy': {
      type: 'create:mixing',
      heat_requirement: 'heated',
      ingredients: [
        { tag: 'c:ingots/zinc' },
        {
          type: 'neoforge:single',
          fluid: 'createaddition:seed_oil',
          amount: 100,
        },
      ],
      results: [{ id: 'createaddition:alloy', count: 2 }],
    },
    'createaddition:compat/other': {
      'neoforge:conditions': [
        { type: 'neoforge:mod_loaded', modid: 'othermod' },
      ],
      type: 'create:milling',
      ingredients: [{ item: 'othermod:x' }],
      results: [{ id: 'othermod:y' }],
    },
    'createaddition:compat/second_pack': {
      'neoforge:conditions': [
        { type: 'neoforge:mod_loaded', modid: 'secondmod' },
      ],
      type: 'create:milling',
      ingredients: [{ item: 'secondmod:rock' }],
      results: [{ id: 'createaddition:dust' }],
    },
    'createaddition:rolling/iron_rod': {
      type: 'createaddition:rolling',
      input: { tag: 'c:ingots/iron' },
      result: { id: 'createaddition:iron_rod', count: 2 },
    },
    'createaddition:sequenced/x': { type: 'create:sequenced_assembly' },
    'createaddition:crafting/alloy_block': {
      type: 'minecraft:crafting_shaped',
      pattern: ['AAA', 'AAA', 'AAA'],
      key: { A: { item: 'createaddition:alloy' } },
      result: { id: 'createaddition:alloy_block', count: 1 },
    },
    // overrides Create's recipe, like a datapack
    'create:crushing/raw_zinc': {
      type: 'create:crushing',
      ingredients: [{ item: 'create:raw_zinc' }],
      results: [{ id: 'create:crushed_raw_zinc', count: 2 }],
    },
  },
  tags: [
    {
      kind: 'item',
      tag: 'c:ingots/zinc',
      json: { values: ['createaddition:zinc_ingot_alt'] },
    },
  ],
  lang: {
    'item.createaddition.iron_sheet': 'Iron Sheet',
    'item.createaddition.alloy': 'Alloy',
    'block.createaddition.alloy_block': 'Alloy Block',
    'item.createaddition.zinc_ingot_alt': 'Other Zinc',
    'fluid.createaddition.seed_oil': 'Seed Oil',
    'item.createaddition.seed_oil_bucket': 'Seed Oil Bucket',
  },
  models: {
    'createaddition:item/alloy_block': {
      parent: 'createaddition:block/alloy_block',
    },
    'createaddition:block/alloy_block': {
      parent: 'minecraft:block/cube_all',
      textures: { all: 'createaddition:block/alloy_side' },
    },
  },
  textures: {
    'createaddition:item/iron_sheet': PNG,
    'createaddition:item/seed_oil_bucket': PNG,
    'createaddition:block/alloy_side': PNG,
  },
})

const second = archive({
  mods: [{ id: 'secondmod', name: 'Second', version: '1' }],
  namespaces: ['secondmod'],
  recipes: {
    'secondmod:milling/rock': {
      type: 'create:milling',
      ingredients: [{ item: 'secondmod:rock' }],
      results: [{ id: 'minecraft:gravel' }],
    },
  },
})

describe('buildPacks', () => {
  const built = buildPacks(
    [
      { id: 'additions', archive: additions },
      { id: 'second', archive: second },
    ],
    base,
    baseTags,
  )
  const recipe = (id: string) => built.data.recipes.find((r) => r.id === id)

  it("normalizes recipes of Create's types with the base tags", () => {
    expect(recipe('createaddition:pressing/iron_plate')).toEqual({
      id: 'createaddition:pressing/iron_plate',
      type: 'pressing',
      inputs: [{ item: 'minecraft:iron_ingot', amount: 1 }],
      outputs: [{ item: 'createaddition:iron_sheet', amount: 1, chance: 1 }],
    })
    expect(built.recipePack['createaddition:pressing/iron_plate']).toBe(
      'additions',
    )
    expect(built.recipePack['secondmod:milling/rock']).toBe('second')
  })

  it('merges tag files of the packs into the base tags', () => {
    expect(recipe('createaddition:mixing/alloy')?.inputs).toEqual([
      { item: '#c:ingots/zinc', amount: 1 },
      { item: 'fluid:createaddition:seed_oil', amount: 100 },
    ])
    expect(built.data.tags['#c:ingots/zinc']).toEqual([
      'create:zinc_ingot',
      'createaddition:zinc_ingot_alt',
    ])
    expect(built.data.items['#c:ingots/zinc']).toEqual({
      id: '#c:ingots/zinc',
      name: 'Zinc Ingot / Other Zinc',
      icon: 'textures/create/zinc_ingot.png',
    })
  })

  it('keeps recipes whose conditions hold for the loaded packs', () => {
    expect(recipe('createaddition:compat/second_pack')).toBeDefined()
    expect(recipe('createaddition:compat/other')).toBeUndefined()
  })

  it('derives compacting from crafting and bucket filling for pack fluids', () => {
    expect(recipe('createaddition:crafting/alloy_block')).toMatchObject({
      type: 'compacting',
      inputs: [{ item: 'createaddition:alloy', amount: 9 }],
    })
    expect(
      recipe('derived:filling/createaddition/seed_oil')?.outputs[0].item,
    ).toBe('createaddition:seed_oil_bucket')
  })

  it('reports what it skipped, per pack and reason', () => {
    expect(built.reports).toEqual([
      {
        id: 'additions',
        recipes: 7,
        skipped: {
          'condition not met': 1,
          'unknown type createaddition:rolling': 1,
          'unknown type create:sequenced_assembly': 1,
        },
      },
      { id: 'second', recipes: 1, skipped: {} },
    ])
  })

  it('names new items from the packs and leaves base items alone', () => {
    expect(built.data.items['createaddition:iron_sheet'].name).toBe(
      'Iron Sheet',
    )
    expect(built.data.items['fluid:createaddition:seed_oil'].name).toBe(
      'Seed Oil',
    )
    expect(built.data.items['secondmod:rock'].name).toBe('Rock')
    expect(built.data.items['minecraft:iron_ingot']).toBeUndefined()
  })

  it('finds icons by item texture, bucket texture or the item model', () => {
    expect(built.icons['createaddition:iron_sheet']).toBe(PNG)
    expect(built.icons['fluid:createaddition:seed_oil']).toBe(PNG)
    expect(built.icons['createaddition:alloy_block']).toBe(PNG)
    expect(built.icons['createaddition:alloy']).toBeUndefined()
  })
})

describe('mergeGameData', () => {
  it('adds pack data to the base; pack recipes replace base recipes with their id', () => {
    const built = buildPacks([{ id: 'a', archive: additions }], base, baseTags)
    const merged = mergeGameData(base, built.data)
    const crushing = merged.recipes.filter(
      (r) => r.id === 'create:crushing/raw_zinc',
    )
    expect(crushing).toHaveLength(1)
    expect(crushing[0].outputs[0].amount).toBe(2)
    expect(merged.items['create:zinc_ingot']).toBe(
      base.items['create:zinc_ingot'],
    )
    expect(merged.items['createaddition:alloy'].name).toBe('Alloy')
    expect(merged.meta).toBe(base.meta)
  })
})

describe('with the shipped base data', () => {
  it('resolves Create recipes of an addon against the generated base tags', async () => {
    const data = (await import('../../data/create-6.0.10.json'))
      .default as GameData
    const tags = (await import('../../data/tags-1.21.1.json'))
      .default as TagEntries
    const built = buildPacks(
      [
        {
          id: 'x',
          archive: archive({
            namespaces: ['x'],
            recipes: {
              'x:pressing/zinc_sheet': {
                type: 'create:pressing',
                ingredients: [{ tag: 'c:ingots/zinc' }],
                results: [{ id: 'x:zinc_sheet' }],
              },
            },
          }),
        },
      ],
      data,
      tags,
    )
    expect(built.data.recipes[0].inputs).toEqual([
      { item: 'create:zinc_ingot', amount: 1 },
    ])
    expect(mergeGameData(data, built.data).recipes).toHaveLength(
      data.recipes.length + 1,
    )
  })
})
