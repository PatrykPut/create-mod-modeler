import { describe, expect, it } from 'vitest'
import data from '../data/create-6.0.10.json'
import type { GameData } from '../data/types'
import { emptyPlan, type Plan } from './model/plan'
import { removeInvalidSources, SOURCES, sourceKind } from './sources'

const at = { x: 0, y: 0 }

describe('sources', () => {
  it('only offers what generators, farms and pumps make', () => {
    expect(sourceKind('minecraft:cobblestone')).toBe('generator')
    expect(sourceKind('create:limestone')).toBe('generator')
    expect(sourceKind('minecraft:oak_log')).toBe('tree')
    expect(sourceKind('minecraft:sugar_cane')).toBe('crop')
    expect(sourceKind('fluid:minecraft:lava')).toBe('fluid')
    expect(sourceKind('minecraft:acacia_boat')).toBeUndefined()
    expect(sourceKind('minecraft:iron_ingot')).toBeUndefined()
    expect(sourceKind('fluid:minecraft:milk')).toBeUndefined()
  })

  it('lists only items of the game data', () => {
    const { items } = data as GameData
    expect(SOURCES.filter((s) => !(s.item in items))).toEqual([])
  })
})

describe('removeInvalidSources', () => {
  const plan: Plan = {
    ...emptyPlan(),
    nodes: [
      {
        id: 'boat',
        kind: 'source',
        item: 'minecraft:acacia_boat',
        perMinute: 10,
        position: at,
      },
      {
        id: 'cobble',
        kind: 'source',
        item: 'minecraft:cobblestone',
        perMinute: null,
        position: at,
      },
      {
        id: 'mill',
        kind: 'recipe',
        recipeId: 'create:milling/cobblestone',
        machineId: 'millstone',
        position: at,
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'boat',
        target: 'mill',
        item: 'minecraft:acacia_boat',
      },
      {
        id: 'e2',
        source: 'cobble',
        target: 'mill',
        item: 'minecraft:cobblestone',
      },
    ],
  }

  it('drops sources nothing automated makes, with their edges', () => {
    const { plan: cleaned, removed } = removeInvalidSources(plan)
    expect(cleaned.nodes.map((n) => n.id)).toEqual(['cobble', 'mill'])
    expect(cleaned.edges.map((e) => e.id)).toEqual(['e2'])
    expect(removed).toEqual(['minecraft:acacia_boat'])
  })

  it('returns a valid plan unchanged', () => {
    const valid = { ...plan, nodes: plan.nodes.slice(1), edges: [] }
    expect(removeInvalidSources(valid)).toEqual({ plan: valid, removed: [] })
  })
})
