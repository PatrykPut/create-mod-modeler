import { describe, expect, it } from 'vitest'
import type { GameData, Recipe } from '../data/types'
import { createCatalog } from './catalog'

const recipe = (
  id: string,
  type: Recipe['type'],
  input: string,
  output: string,
): Recipe => ({
  id,
  type,
  inputs: [{ item: input, amount: 1 }],
  outputs: [{ item: output, amount: 1, chance: 1 }],
})

const data: GameData = {
  meta: { create: 'test', minecraft: 'test', createTag: 'test' },
  items: {},
  tags: {
    '#minecraft:planks': ['minecraft:oak_planks', 'minecraft:birch_planks'],
  },
  recipes: [
    recipe('stick', 'mixing', '#minecraft:planks', 'minecraft:stick'),
    recipe('oak', 'cutting', 'minecraft:oak_log', 'minecraft:oak_planks'),
    recipe('beef_smelt', 'smelting', 'minecraft:beef', 'minecraft:cooked_beef'),
    recipe('beef_smoke', 'smoking', 'minecraft:beef', 'minecraft:cooked_beef'),
    recipe(
      'iron_smelt',
      'smelting',
      'minecraft:raw_iron',
      'minecraft:iron_ingot',
    ),
    recipe(
      'iron_blast',
      'blasting',
      'minecraft:raw_iron',
      'minecraft:iron_ingot',
    ),
    recipe('only_blast', 'blasting', 'minecraft:x_ore', 'minecraft:x'),
  ],
}
const catalog = createCatalog(data)
const machines = (id: string) => catalog.machinesFor(catalog.recipe(id)!)

describe('tags', () => {
  it('lets a tag input accept every member', () => {
    expect(catalog.accepts('#minecraft:planks', 'minecraft:oak_planks')).toBe(
      true,
    )
    expect(catalog.accepts('#minecraft:planks', 'minecraft:stick')).toBe(false)
    expect(catalog.accepts('minecraft:stick', 'minecraft:stick')).toBe(true)
  })

  it('finds consumers of a member and producers of a tag', () => {
    expect(
      catalog.consumers('minecraft:oak_planks').map((o) => o.recipe.id),
    ).toEqual(['stick'])
    expect(
      catalog.producers('#minecraft:planks').map((o) => o.recipe.id),
    ).toEqual(['oak'])
  })
})

describe('fan blasting', () => {
  it('burns food that a smoker could cook', () => {
    expect(machines('beef_smelt')).toEqual(['furnace'])
    expect(machines('iron_smelt')).toEqual(['fan_blasting', 'furnace'])
  })

  it('runs blasting recipes only for items without a smelting recipe', () => {
    expect(machines('iron_blast')).toEqual(['blast_furnace'])
    expect(machines('only_blast')).toEqual(['blast_furnace', 'fan_blasting'])
  })
})
