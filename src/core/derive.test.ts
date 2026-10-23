import { describe, expect, it } from 'vitest'
import data from '../data/create-6.0.10.json'
import type { GameData } from '../data/types'
import { createCatalog } from './catalog'
import { analyze } from './derive'
import {
  emptyPlan,
  type Plan,
  type PlanEdge,
  type PlanNode,
} from './model/plan'

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
    // cobblestone source, drill on an optimised generator: 1200 / 11 ticks = 109/min → 0.55 → 1
    expect(nodes.cobble.machines).toMatchObject({
      exact: expect.closeTo(0.55),
      count: 1,
    })
    expect(nodes.cobble.stress).toBe(1024)
    expect(summary.stress).toBe(1024 + 1024 + 4096 + 2048)
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
      { machine: 'mechanical_drill', count: 1 },
      { machine: 'millstone', count: 1 },
      { machine: 'fan_washing', count: 8 },
      { machine: 'press_basin', count: 1 },
    ])
  })

  it('counts drills for generated sources unless switched off', () => {
    const slow = analyze(ironChain({ cobble: { rpm: 32 } }), catalog).nodes
    // 1200 / 66 ticks = 18.2/min → 3.3 → 4 drills × 4 SU/RPM × 32
    expect(slow.cobble.machines.count).toBe(4)
    expect(slow.cobble.stress).toBe(4 * 4 * 32)

    const off = analyze(ironChain({ cobble: { drill: false } }), catalog)
    expect(off.nodes.cobble.machines.count).toBe(0)
    expect(off.summary.machines.map((m) => m.machine)).not.toContain(
      'mechanical_drill',
    )
  })

  it('sizes drills of an unlimited source by what is drawn', () => {
    const { nodes } = analyze(
      ironChain({
        cobble: { perMinute: null },
        compact: { target: { item: 'minecraft:iron_ingot', perMinute: 2 } },
      }),
      catalog,
    )
    // 2 ingots = 18 nuggets = 144 gravel = 144 cobblestone/min → 1.32 → 2 drills
    expect(nodes.cobble.solved.runsPerMinute).toBeCloseTo(144)
    expect(nodes.cobble.machines.count).toBe(2)
  })

  it('has no drill for items a generator cannot make', () => {
    const { nodes } = analyze(
      {
        ...ironChain(),
        nodes: [
          {
            id: 'gravel',
            kind: 'source',
            item: 'minecraft:gravel',
            perMinute: 60,
            position: at,
          },
        ],
        edges: [],
      },
      catalog,
    )
    expect(nodes.gravel.machines.count).toBe(0)
    expect(nodes.gravel.stress).toBe(0)
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

const single = (node: object): Plan => ({
  ...emptyPlan(),
  nodes: [{ id: 'n', kind: 'recipe', position: at, ...node } as PlanNode],
  edges: [],
})

describe('heat and fuel', () => {
  const brass = (perMinute: number, extra: object = {}) =>
    single({
      recipeId: 'create:mixing/brass_ingot',
      machineId: 'mixer',
      target: { item: 'create:brass_ingot', perMinute },
      ...extra,
    })

  it('puts a Blaze Burner under every basin that burns fuel all the time', () => {
    // mixer at 256 RPM: 17 ticks → 70.6 runs/min; 100 brass = 50 runs → 1 mixer
    const { nodes, summary } = analyze(brass(100), catalog)
    expect(nodes.n.machines.count).toBe(1)
    expect(nodes.n.burners).toBe(1)
    expect(nodes.n.stress).toBe(4 * 256)
    expect(nodes.n.solved.inputs[2]).toMatchObject({
      item: 'minecraft:coal',
      perMinute: expect.closeTo(0.75),
      fuel: true,
    })
    expect(summary.machines).toContainEqual({
      machine: 'blaze_burner',
      count: 1,
    })
    expect(summary.inputs).toContainEqual({
      item: 'minecraft:coal',
      perMinute: expect.closeTo(0.75),
    })
  })

  it('counts fuel per burner, not per run', () => {
    // 150 runs → 2.1 → 3 mixers, 3 burners
    const { nodes } = analyze(brass(300), catalog)
    expect(nodes.n.burners).toBe(3)
    expect(nodes.n.solved.inputs[2].perMinute).toBeCloseTo(2.25)
  })

  it('uses the chosen fuel and returns buckets', () => {
    const { nodes } = analyze(
      brass(100, { fuel: 'minecraft:lava_bucket' }),
      catalog,
    )
    expect(nodes.n.solved.inputs[2].perMinute).toBeCloseTo(1200 / 20000)
    expect(nodes.n.solved.outputs).toContainEqual(
      expect.objectContaining({
        item: 'minecraft:bucket',
        perMinute: expect.closeTo(1200 / 20000),
      }),
    )
  })

  it('needs no burner for unheated recipes', () => {
    const { nodes } = analyze(
      single({
        recipeId: 'create:mixing/andesite_alloy',
        machineId: 'mixer',
        target: { item: 'create:andesite_alloy', perMinute: 10 },
      }),
      catalog,
    )
    expect(nodes.n.burners).toBe(0)
    expect(nodes.n.solved.inputs).toHaveLength(2)
  })

  it('warns when a mixer turns too slowly', () => {
    const { nodes } = analyze(brass(100, { rpm: 16 }), catalog)
    expect(nodes.n.warning).toMatch(/at least 30 RPM/)
  })

  it('burns furnace fuel per item', () => {
    const { nodes } = analyze(
      single({
        recipeId: 'minecraft:iron_ingot_from_smelting_raw_iron',
        machineId: 'furnace',
        target: { item: 'minecraft:iron_ingot', perMinute: 12 },
      }),
      catalog,
    )
    // 200 ticks → 6 per furnace; 12 × 200 / 1600 coal
    expect(nodes.n.machines.count).toBe(2)
    expect(nodes.n.stress).toBe(0)
    expect(nodes.n.solved.inputs[1].perMinute).toBeCloseTo(1.5)
  })
})

describe('mechanical crafter', () => {
  it('counts one crafter per grid cell for stress', () => {
    const { nodes } = analyze(
      single({
        recipeId: 'create:mechanical_crafting/crushing_wheel',
        machineId: 'mechanical_crafter',
        target: { item: 'create:crushing_wheel', perMinute: 2 },
      }),
      catalog,
    )
    expect(nodes.n.machines.count).toBe(1)
    expect(nodes.n.stress).toBe(21 * 2 * 256)
  })
})

describe('transport limits', () => {
  const withTransport = (transport: PlanEdge['transport']) => {
    const plan = ironChain()
    plan.edges[0] = { ...plan.edges[0], transport }
    return analyze(plan, catalog).edges.e1
  }

  it('leaves ideal edges unlimited', () => {
    expect(withTransport(undefined)).toEqual({
      flow: expect.closeTo(60),
      lanes: 1,
      over: false,
    })
  })

  it('checks belts against their speed and items per entry', () => {
    // 256 RPM, single items: 640/min
    expect(withTransport({ type: 'belt' })).toMatchObject({
      limit: 640,
      lanes: 1,
      over: false,
    })
    // 16 RPM: 40/min → 2 belts for 60/min
    expect(withTransport({ type: 'belt', rpm: 16 })).toMatchObject({
      limit: 40,
      lanes: 2,
      over: true,
    })
    expect(
      withTransport({ type: 'belt', rpm: 16, itemsPerEntry: 64 }).over,
    ).toBe(false)
  })

  it('lists edges over their limit as bottlenecks', () => {
    const plan = ironChain()
    plan.edges[0] = { ...plan.edges[0], transport: { type: 'chute' } }
    plan.edges[1] = {
      ...plan.edges[1],
      transport: { type: 'belt', rpm: 8 },
    }
    const { summary } = analyze(plan, catalog)
    // 8 RPM belt: 20/min for 60 gravel/min
    expect(summary.bottlenecks).toEqual([
      { edge: 'e2', item: 'minecraft:gravel', lanes: 3 },
    ])
  })

  it('puts a pump on every pipe', () => {
    const plan: Plan = {
      ...emptyPlan(),
      nodes: [
        {
          id: 'lava',
          kind: 'source',
          item: 'fluid:minecraft:lava',
          perMinute: null,
          position: at,
        },
        {
          id: 'fill',
          kind: 'recipe',
          recipeId: 'derived:filling/minecraft/lava',
          machineId: 'spout',
          target: { item: 'minecraft:lava_bucket', perMinute: 10 },
          position: at,
        },
      ],
      edges: [
        {
          id: 'p',
          source: 'lava',
          target: 'fill',
          item: 'fluid:minecraft:lava',
          transport: { type: 'pipe', rpm: 64 },
        },
      ],
    }
    const { edges, summary } = analyze(plan, catalog)
    // 64 RPM: 32 mB/tick = 38,400 mB/min
    expect(edges.p).toMatchObject({ limit: 38400, lanes: 1, stress: 4 * 64 })
    expect(summary.machines).toContainEqual({
      machine: 'mechanical_pump',
      count: 1,
    })
    expect(summary.stress).toBe(256)
  })
})

describe('power', () => {
  const powered = (...power: object[]) => {
    const plan = ironChain()
    plan.nodes.push(
      ...power.map(
        (p, i) =>
          ({ id: `p${i}`, kind: 'power', position: at, ...p }) as PlanNode,
      ),
    )
    return analyze(plan, catalog)
  }

  it('builds enough of an auto source to cover the stress', () => {
    // the chain needs 8192 SU; a water wheel gives 256
    const { power, summary } = powered({ source: 'water_wheel' })
    expect(power.p0).toMatchObject({ count: 32, capacity: 8192 })
    expect(summary.capacity).toBe(8192)
    expect(summary.machines).toContainEqual({
      machine: 'water_wheel',
      count: 32,
    })
  })

  it('lets fixed counts go first and auto sources cover the rest', () => {
    const { power, summary } = powered(
      { source: 'water_wheel', count: 10 },
      { source: 'large_water_wheel' },
    )
    expect(power.p0.capacity).toBe(2560)
    // 8192 − 2560 = 5632 = 11 large wheels
    expect(power.p1.count).toBe(11)
    expect(summary.capacity).toBe(8192)
  })

  it('reports missing capacity of fixed sources', () => {
    const { summary } = powered({ source: 'windmill', count: 1, sails: 64 })
    // 64 sails: 8 RPM × 512
    expect(summary.capacity).toBe(4096)
    expect(summary.stress).toBe(8192)
  })

  it('sizes steam engines by boiler level and adds their water pumps', () => {
    const { power, summary } = powered({ source: 'steam_engine', count: 13 })
    expect(power.p0).toMatchObject({
      count: 13,
      capacity: 13 * 16384,
      boiler: { boilers: 1, level: 13, pumpsPerBoiler: 2 },
      stress: 2 * 4 * 256,
    })
    expect(summary.stress).toBe(8192 + 2048)
    expect(summary.machines).toContainEqual({
      machine: 'mechanical_pump',
      count: 2,
    })

    // auto: 8192 SU + its own pump fits on one engine
    const auto = powered({ source: 'steam_engine' })
    expect(auto.power.p0).toMatchObject({ count: 1, boiler: { level: 1 } })
  })
})
