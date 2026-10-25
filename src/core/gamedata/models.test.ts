import { describe, expect, it } from 'vitest'
import { iconTexture } from './models.ts'

const models: Record<string, object> = {
  'create:item/andesite_bars': {
    parent: 'minecraft:item/generated',
    textures: { layer0: 'create:block/bars/andesite_bars' },
  },
  'create:item/asurine': {
    parent: 'minecraft:block/cube_all',
    textures: { all: 'create:block/palettes/asurine_1' },
  },
  'minecraft:item/stone_slab': { parent: 'minecraft:block/stone_slab' },
  'minecraft:block/stone_slab': {
    parent: 'minecraft:block/slab',
    textures: {
      bottom: 'minecraft:block/stone',
      side: 'minecraft:block/stone',
      top: 'minecraft:block/stone',
    },
  },
  'minecraft:block/slab': {
    parent: 'block/block',
    textures: { particle: '#side' },
  },
  'minecraft:block/block': {},
  'minecraft:item/furnace': { parent: 'minecraft:block/furnace' },
  'minecraft:block/furnace': {
    parent: 'minecraft:block/orientable',
    textures: {
      front: 'minecraft:block/furnace_front',
      side: 'minecraft:block/furnace_side',
    },
  },
  'minecraft:block/orientable': { textures: { particle: '#front' } },
  'create:item/mechanical_press': {
    parent: 'create:block/mechanical_press/item',
  },
  'create:block/mechanical_press/item': {
    textures: { '0': 'create:block/press' },
  },
}
const read = (id: string) => models[id]

describe('iconTexture', () => {
  it('uses the layer of a flat item model', () => {
    expect(iconTexture('create:andesite_bars', read)).toBe(
      'create:block/bars/andesite_bars',
    )
  })

  it('follows block parents and prefers a face texture', () => {
    expect(iconTexture('create:asurine', read)).toBe(
      'create:block/palettes/asurine_1',
    )
    expect(iconTexture('minecraft:stone_slab', read)).toBe(
      'minecraft:block/stone',
    )
    expect(iconTexture('minecraft:furnace', read)).toBe(
      'minecraft:block/furnace_front',
    )
  })

  it('falls back to any texture and to nothing', () => {
    expect(iconTexture('create:mechanical_press', read)).toBe(
      'create:block/press',
    )
    expect(iconTexture('create:missing', read)).toBeUndefined()
  })
})
