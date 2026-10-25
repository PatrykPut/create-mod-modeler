import { describe, expect, it } from 'vitest'
import { TagIndex } from './tags.ts'

describe('TagIndex', () => {
  const tags = new TagIndex((id) => /^(minecraft|create):/.test(id))
  tags.add('item', 'minecraft:planks', {
    values: ['minecraft:oak_planks', 'minecraft:spruce_planks'],
  })
  tags.add('item', 'c:ingots', {
    values: ['#c:ingots/iron', '#c:ingots/zinc'],
  })
  tags.add('item', 'c:ingots/iron', { values: ['minecraft:iron_ingot'] })
  tags.add('item', 'c:ingots/zinc', {
    values: [{ id: 'othermod:zinc_ingot', required: false }],
  })
  // a second file for the same tag adds to it
  tags.add('item', 'c:ingots/zinc', { values: ['create:zinc_ingot'] })
  tags.add('item', 'c:loop', { values: ['#c:loop', 'minecraft:stone'] })

  it('resolves nested tags and keeps only supported namespaces', () => {
    expect(tags.resolve('item', 'c:ingots')).toEqual([
      'minecraft:iron_ingot',
      'create:zinc_ingot',
    ])
  })

  it('merges tag files and skips optional entries of other mods', () => {
    expect(tags.resolve('item', 'c:ingots/zinc')).toEqual(['create:zinc_ingot'])
  })

  it('survives self-referencing tags and unknown tags', () => {
    expect(tags.resolve('item', 'c:loop')).toEqual(['minecraft:stone'])
    expect(tags.resolve('item', 'c:missing')).toEqual([])
  })

  it('keeps item and fluid tags apart', () => {
    tags.add('fluid', 'c:milk', {
      values: [{ id: 'minecraft:milk', required: false }],
    })
    expect(tags.resolve('fluid', 'c:milk')).toEqual(['minecraft:milk'])
    expect(tags.resolve('item', 'c:milk')).toEqual([])
  })

  it('round-trips through JSON with another set of supported namespaces', () => {
    const copy = TagIndex.fromJSON(JSON.parse(JSON.stringify(tags)), (id) =>
      /^(minecraft|create|othermod):/.test(id),
    )
    expect(copy.resolve('item', 'c:ingots/zinc')).toEqual([
      'othermod:zinc_ingot',
      'create:zinc_ingot',
    ])
  })

  it('lets a later tag file replace the earlier ones', () => {
    const copy = TagIndex.fromJSON(tags.toJSON(), () => true)
    copy.add('item', 'minecraft:planks', {
      replace: true,
      values: ['minecraft:birch_planks'],
    })
    expect(copy.resolve('item', 'minecraft:planks')).toEqual([
      'minecraft:birch_planks',
    ])
    expect(tags.resolve('item', 'minecraft:planks')).toHaveLength(2)
  })
})
