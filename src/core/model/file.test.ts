import { describe, expect, it } from 'vitest'
import {
  decodeShare,
  encodeShare,
  parsePlanFile,
  PlanFileError,
  toPlanFile,
} from './file'
import { emptyPlan, type Plan } from './plan'

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

describe('plan files', () => {
  it('round-trips a plan with its name', () => {
    const text = JSON.stringify(toPlanFile('Iron', plan))
    expect(parsePlanFile(text)).toEqual({ name: 'Iron', plan })
  })

  it('also reads a bare plan', () => {
    expect(parsePlanFile(JSON.stringify(plan))).toEqual({
      name: 'Imported plan',
      plan,
    })
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
    expect(await decodeShare(code)).toEqual({ name: 'Iron', plan })
  })

  it('rejects broken codes', async () => {
    await expect(decodeShare('abc')).rejects.toThrow(PlanFileError)
  })
})
