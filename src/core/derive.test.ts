import { describe, expect, it } from 'vitest'
import data from '../data/create-6.0.10.json'
import type { GameData } from '../data/types'
import { createCatalog } from './catalog'
import { analyze } from './derive'
import { emptyPlan, type Plan, type PlanNode } from './model/plan'

const catalog = createCatalog(data as GameData)
const at = { x: 0, y: 0 }

// The reference chain from docs/IMPLEMENTATION.md (M1).
function ironChain(overrides: Partial<Record<string, object>> = {}): Plan {
  const nodes: PlanNode[] = [
    {
      id: 'cobble',
      kind: 'source',
      item: 'minecraft:cobblestone',
      perMinute: 60,
      position: at,
    },
    {
      id: 'mill',
      kind: 'recipe',
      recipeId: 'create:milling/cobblestone',
      machineId: 'millstone',
      position: at,
    },
    {
      id: 'wash',
      kind: 'recipe',
      recipeId: 'create:splashing/gravel',
      machineId: 'fan_washing',
      position: at,
    },
    {
      id: 'compact',
      kind: 'recipe',
      recipeId: 'minecraft:iron_ingot_from_nuggets',
      machineId: 'press_basin',
      position: at,
    },
  ].map((n) => ({ ...n, ...overrides[n.id] }) as PlanNode)
  return {
    ...emptyPlan(),
    nodes,
    edges: [
      {
        id: 'e1',
        source: 'cobble',
        target: 'mill',
        item: 'minecraft:cobblestone',
      },
      { id: 'e2', source: 'mill', target: 'wash', item: 'minecraft:gravel' },
      {
        id: 'e3',
        source: 'wash',
        target: 'compact',
        item: 'minecraft:iron_nugget',
      },
    ],
  }
}

describe('analyze: cobblestone → gravel → iron nuggets → iron ingot at 256 RPM', () => {
  const { nodes, summary } = analyze(ironChain(), catalog)

  it('computes the rates', () => {
    expect(nodes.mill.solved.outputs[0].perMinute).toBeCloseTo(60)
    const wash = Object.fromEntries(
      nodes.wash.solved.outputs.map((o) => [o.item, o.perMinute]),
    )
    expect(wash['minecraft:iron_nugget']).toBeCloseTo(7.5)
    expect(wash['minecraft:flint']).toBeCloseTo(15)
    expect(nodes.compact.solved.outputs[0].perMinute).toBeCloseTo(0.8333, 3)
  })

  it('computes machine counts and stress', () => {
    // millstone: 1200 / 17 ticks = 70.6 runs/min → 0.85 → 1 × 4 SU/RPM
    expect(nodes.mill.machines).toMatchObject({
      exact: expect.closeTo(0.85),
      count: 1,
    })
    expect(nodes.mill.stress).toBe(1024)
    // fan, single items, one stack in the air current: 1200 / 153 = 7.84/min → 7.65 → 8
    expect(nodes.wash.machines).toMatchObject({
      exact: expect.closeTo(7.65),
      count: 8,
    })
    expect(nodes.wash.stress).toBe(8 * 2 * 256)
    // press: 1200 / 10 ticks = 120 strokes/min
    expect(nodes.compact.machines.count).toBe(1)
    expect(nodes.compact.machines.utilization).toBeCloseTo(0.8333 / 120, 4)
    expect(nodes.compact.stress).toBe(2048)
    expect(summary.stress).toBe(1024 + 4096 + 2048)
  })

  it('lists inputs, products and machines', () => {
    expect(summary.inputs).toEqual([
      { item: 'minecraft:cobblestone', perMinute: expect.closeTo(60) },
    ])
    expect(summary.products).toEqual([
      { item: 'minecraft:flint', perMinute: expect.closeTo(15) },
      { item: 'minecraft:iron_ingot', perMinute: expect.closeTo(0.8333, 3) },
    ])
    expect(summary.machines).toEqual([
      { machine: 'millstone', count: 1 },
      { machine: 'fan_washing', count: 8 },
      { machine: 'press_basin', count: 1 },
    ])
  })

  it('applies per-node overrides', () => {
    const { nodes } = analyze(
      ironChain({
        mill: { rpm: 32 },
        wash: { stackSize: 64, parallelStacks: 2 },
      }),
      catalog,
    )
    // millstone at 32 RPM: 1200 / 126 = 9.52/min → 6.3 → 7
    expect(nodes.mill.machines.count).toBe(7)
    expect(nodes.mill.stress).toBe(7 * 4 * 32)
    // 2 stacks of 64 per 603 ticks = 254.7/min → 1 fan
    expect(nodes.wash.machines.count).toBe(1)
  })

  it('uses crushing wheels for milling recipes when no crushing recipe exists', () => {
    expect(
      catalog.machinesFor(catalog.recipe('create:milling/cobblestone')!),
    ).toContain('crushing_wheels')
    expect(
      catalog.machinesFor(catalog.recipe('create:milling/gravel')!),
    ).not.toContain('crushing_wheels')

    const { nodes } = analyze(
      ironChain({ mill: { machineId: 'crushing_wheels' } }),
      catalog,
    )
    // 1200 / 13 ticks = 92.3/min → 1 pair × 16 SU/RPM
    expect(nodes.mill.machines.count).toBe(1)
    expect(nodes.mill.stress).toBe(16 * 256)
  })
})
