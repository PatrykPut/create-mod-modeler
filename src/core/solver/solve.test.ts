import { describe, expect, it } from 'vitest'
import type { GameData } from '../../data/types'
import { createCatalog } from '../catalog'
import {
  emptyPlan,
  type Plan,
  type PlanEdge,
  type PlanNode,
} from '../model/plan'
import { solve } from './solve'

// a → 2 b ; b → c (50 % chance) ; c + c → a (to build a cycle)
const data: GameData = {
  meta: { create: 'test', minecraft: 'test', createTag: 'test' },
  items: {},
  tags: { '#t': ['x', 'y'] },
  recipes: [
    {
      id: 'tc',
      type: 'milling',
      inputs: [{ item: '#t', amount: 1 }],
      outputs: [{ item: 'c', amount: 1, chance: 1 }],
    },
    {
      id: 'smelt',
      type: 'smelting',
      inputs: [{ item: 'a', amount: 1 }],
      outputs: [{ item: 'b', amount: 1, chance: 1 }],
    },
    {
      id: 'hot',
      type: 'mixing',
      heat: 'heated',
      inputs: [{ item: 'a', amount: 1 }],
      outputs: [{ item: 'b', amount: 1, chance: 1 }],
    },
    {
      id: 'ab',
      type: 'milling',
      inputs: [{ item: 'a', amount: 1 }],
      outputs: [{ item: 'b', amount: 2, chance: 1 }],
    },
    {
      id: 'bc',
      type: 'splashing',
      inputs: [{ item: 'b', amount: 1 }],
      outputs: [{ item: 'c', amount: 1, chance: 0.5 }],
    },
    {
      id: 'ca',
      type: 'compacting',
      inputs: [{ item: 'c', amount: 2 }],
      outputs: [{ item: 'a', amount: 1, chance: 1 }],
    },
  ],
}
const catalog = createCatalog(data)

const at = { x: 0, y: 0 }
const source = (id: string, item: string, perMinute: number | null) =>
  ({ id, kind: 'source', item, perMinute, position: at }) as PlanNode
const recipe = (
  id: string,
  recipeId: string,
  target?: { item: string; perMinute: number },
) =>
  ({
    id,
    kind: 'recipe',
    recipeId,
    machineId: 'millstone',
    position: at,
    ...(target && { target }),
  }) as PlanNode
const edge = (source: string, target: string, item: string): PlanEdge => ({
  id: `${source}-${target}-${item}`,
  source,
  target,
  item,
})
const plan = (nodes: PlanNode[], edges: PlanEdge[]): Plan => ({
  ...emptyPlan(),
  nodes,
  edges,
})

describe('solve', () => {
  it('pushes a fixed source through the whole chain', () => {
    const result = solve(
      plan(
        [source('s', 'a', 60), recipe('r1', 'ab'), recipe('r2', 'bc')],
        [edge('s', 'r1', 'a'), edge('r1', 'r2', 'b')],
      ),
      catalog,
    )
    expect(result.nodes.r1.runsPerMinute).toBeCloseTo(60)
    expect(result.nodes.r2.runsPerMinute).toBeCloseTo(120)
    expect(result.nodes.r2.outputs[0]).toMatchObject({
      item: 'c',
      perMinute: expect.closeTo(60),
      connected: false,
    })
    expect(result.edges['r1-r2-b']).toBeCloseTo(120)
  })

  it('solves backwards from a target and draws on an unlimited source', () => {
    const result = solve(
      plan(
        [
          source('s', 'a', null),
          recipe('r1', 'ab'),
          recipe('r2', 'bc', { item: 'c', perMinute: 10 }),
        ],
        [edge('s', 'r1', 'a'), edge('r1', 'r2', 'b')],
      ),
      catalog,
    )
    expect(result.nodes.r2.runsPerMinute).toBeCloseTo(20)
    expect(result.nodes.r1.runsPerMinute).toBeCloseTo(10)
    expect(result.nodes.s.outputs[0].perMinute).toBeCloseTo(10)
  })

  it('reports shortage when a target exceeds a fixed source', () => {
    const result = solve(
      plan(
        [source('s', 'a', 5), recipe('r1', 'ab', { item: 'b', perMinute: 20 })],
        [edge('s', 'r1', 'a')],
      ),
      catalog,
    )
    expect(result.nodes.r1.runsPerMinute).toBeCloseTo(10)
    expect(result.nodes.r1.inputs[0].shortage).toBeCloseTo(5)
  })

  it('reports surplus a connected consumer cannot take', () => {
    const result = solve(
      plan(
        [
          source('s', 'a', 60),
          recipe('r1', 'ab', { item: 'b', perMinute: 20 }),
        ],
        [edge('s', 'r1', 'a')],
      ),
      catalog,
    )
    expect(result.nodes.s.outputs[0].surplus).toBeCloseTo(50)
  })

  it('treats unconnected inputs as external supply', () => {
    const result = solve(
      plan([recipe('r1', 'ab', { item: 'b', perMinute: 20 })], []),
      catalog,
    )
    expect(result.nodes.r1.inputs[0]).toMatchObject({
      perMinute: expect.closeTo(10),
      connected: false,
      shortage: 0,
    })
  })

  it('splits an output evenly between consumers that could take everything', () => {
    const result = solve(
      plan(
        [source('s', 'b', 60), recipe('r1', 'bc'), recipe('r2', 'bc')],
        [edge('s', 'r1', 'b'), edge('s', 'r2', 'b')],
      ),
      catalog,
    )
    expect(result.edges['s-r1-b']).toBeCloseTo(30)
    expect(result.edges['s-r2-b']).toBeCloseTo(30)
  })

  it('handles cycles', () => {
    // 60 a/min in, a → 2b → c (50 %) → half the c goes back as a
    const result = solve(
      plan(
        [
          source('s', 'a', 60),
          recipe('r1', 'ab'),
          recipe('r2', 'bc'),
          recipe('r3', 'ca'),
        ],
        [
          edge('s', 'r1', 'a'),
          edge('r1', 'r2', 'b'),
          edge('r2', 'r3', 'c'),
          edge('r3', 'r1', 'a'),
        ],
      ),
      catalog,
    )
    // a_total = 60 + a_total / 2  →  a_total = 120
    expect(result.nodes.r1.runsPerMinute).toBeCloseTo(120)
    expect(result.nodes.r3.runsPerMinute).toBeCloseTo(60)
  })

  it('is all zero without a source rate or target', () => {
    const result = solve(
      plan(
        [source('s', 'a', null), recipe('r1', 'ab')],
        [edge('s', 'r1', 'a')],
      ),
      catalog,
    )
    expect(result.nodes.r1.runsPerMinute).toBeCloseTo(0)
  })

  it('feeds members of a tag into a tag input', () => {
    const result = solve(
      plan(
        [source('x', 'x', 10), source('y', 'y', 5), recipe('r', 'tc')],
        [
          { ...edge('x', 'r', 'x'), targetItem: '#t' },
          { ...edge('y', 'r', 'y'), targetItem: '#t' },
        ],
      ),
      catalog,
    )
    expect(result.nodes.r.runsPerMinute).toBeCloseTo(15)
    expect(result.nodes.r.inputs[0]).toMatchObject({
      item: '#t',
      connected: true,
      shortage: 0,
    })
  })

  it('adds a fixed fuel demand for the Blaze Burners of a heated recipe', () => {
    const hot = {
      ...recipe('r', 'hot', { item: 'b', perMinute: 10 }),
      machineId: 'mixer',
    } as PlanNode
    const result = solve(plan([hot], []), catalog, { burners: { r: 2 } })
    expect(result.nodes.r.inputs[1]).toMatchObject({
      item: 'minecraft:coal',
      // 2 burners × 1200 / 1600 ticks
      perMinute: expect.closeTo(1.5),
      fuel: true,
    })
    // a connected fuel supply has to cover it
    const fed = solve(
      plan(
        [hot, source('coal', 'minecraft:coal', 1)],
        [edge('coal', 'r', 'minecraft:coal')],
      ),
      catalog,
      { burners: { r: 2 } },
    )
    expect(fed.nodes.r.inputs[1].shortage).toBeCloseTo(0.5)
  })

  it('burns furnace fuel per item', () => {
    const smelt = {
      ...recipe('r', 'smelt', { item: 'b', perMinute: 16 }),
      machineId: 'furnace',
    } as PlanNode
    const result = solve(plan([smelt], []), catalog)
    // 200 ticks per item, coal burns 1600
    expect(result.nodes.r.inputs[1]).toMatchObject({
      item: 'minecraft:coal',
      perMinute: expect.closeTo(2),
    })
  })
})
