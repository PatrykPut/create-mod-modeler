import { describe, expect, it } from 'vitest'
import {
  decodeShare,
  encodeShare,
  parsePlanFile,
  PlanFileError,
  toPlanFile,
} from './file'
import { emptyPlan, type AddonRecipes, type Plan } from './plan'

const plan: Plan = {
  ...emptyPlan(),
  settings: { rpm: 128, timeUnit: 'second' },
  nodes: [
    {
      id: 'a',
      kind: 'source',
      item: 'minecraft:cobblestone',
      perMinute: 60,
      position: { x: 0, y: 0 },
    },
    {
      id: 'b',
      kind: 'recipe',
      recipeId: 'create:milling/cobblestone',
      machineId: 'millstone',
      position: { x: 300, y: 0 },
    },
    {
      id: 'c',
      kind: 'power',
      source: 'steam_engine',
      position: { x: 0, y: 300 },
    },
  ],
  edges: [
    {
      id: 'e',
      source: 'a',
      target: 'b',
      item: 'minecraft:cobblestone',
      transport: { type: 'belt', rpm: 64 },
    },
  ],
}

const addons: AddonRecipes = {
  packs: { addon: { name: 'Addon', version: '1.0' } },
  recipes: [
    {
      id: 'addon:pressing/plate',
      type: 'pressing',
      inputs: [{ item: 'minecraft:iron_ingot', amount: 1 }],
      outputs: [{ item: 'addon:plate', amount: 1, chance: 1 }],
    },
  ],
  recipePack: { 'addon:pressing/plate': 'addon' },
  items: { 'addon:plate': { id: 'addon:plate', name: 'Plate' } },
  tags: {},
  icons: { 'addon:plate': 'data:image/png;base64,AQID' },
}
const withAddons: Plan = { ...plan, addons }

describe('plan files', () => {
  it('round-trips a plan with its name', () => {
    const text = JSON.stringify(toPlanFile('Iron', plan))
    expect(parsePlanFile(text)).toEqual({ name: 'Iron', plan, removed: [] })
  })

  it('keeps the addon recipes the plan carries', () => {
    const text = JSON.stringify(toPlanFile('Plates', withAddons))
    expect(parsePlanFile(text).plan).toEqual(withAddons)
  })

  it('also reads a bare plan', () => {
    expect(parsePlanFile(JSON.stringify(plan))).toEqual({
      name: 'Imported plan',
      plan,
      removed: [],
    })
  })

  it('keeps a valid default stack size and drops an invalid one', () => {
    const read = (stackSize: unknown) =>
      parsePlanFile(
        JSON.stringify({ ...plan, settings: { ...plan.settings, stackSize } }),
      ).plan.settings
    expect(read(16)).toEqual({ rpm: 128, timeUnit: 'second', stackSize: 16 })
    expect(read(100)).toEqual({ rpm: 128, timeUnit: 'second' })
    expect(read('x')).toEqual({ rpm: 128, timeUnit: 'second' })
  })

  it('drops edges whose nodes are missing', () => {
    const broken = {
      ...plan,
      edges: [
        ...plan.edges,
        { id: 'x', source: 'a', target: 'zzz', item: 'i' },
      ],
    }
    expect(parsePlanFile(JSON.stringify(broken)).plan.edges).toEqual(plan.edges)
  })

  it('removes sources that no farm or generator makes', () => {
    const boat = {
      ...plan,
      nodes: [{ ...plan.nodes[0], item: 'minecraft:acacia_boat' }],
    }
    const { plan: read, removed } = parsePlanFile(JSON.stringify(boat))
    expect(read.nodes).toEqual([])
    expect(read.edges).toEqual([])
    expect(removed).toEqual(['minecraft:acacia_boat'])
  })

  it('rejects files that are not plans', () => {
    expect(() => parsePlanFile('not json')).toThrow(PlanFileError)
    expect(() => parsePlanFile('{"hello": 1}')).toThrow(
      /not a Create Mod Modeler plan/,
    )
    expect(() =>
      parsePlanFile(JSON.stringify({ ...plan, schemaVersion: 99 })),
    ).toThrow(/newer version/)
    expect(() =>
      parsePlanFile(
        JSON.stringify({ ...plan, nodes: [{ id: 'q', kind: 'robot' }] }),
      ),
    ).toThrow(/node 1/)
  })
})

describe('share links', () => {
  it('compresses a plan into a URL-safe code and back', async () => {
    const code = await encodeShare('Iron', plan)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(code.length).toBeLessThan(JSON.stringify(plan).length)
    expect(await decodeShare(code)).toEqual({ name: 'Iron', plan, removed: [] })
  })

  it('leaves addon icons out of share links', async () => {
    const { icons: _icons, ...rest } = addons
    const code = await encodeShare('Plates', withAddons)
    expect((await decodeShare(code)).plan).toEqual({ ...plan, addons: rest })
  })

  it('rejects broken codes', async () => {
    await expect(decodeShare('abc')).rejects.toThrow(PlanFileError)
  })
})
