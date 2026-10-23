import { describe, expect, it } from 'vitest'
import data from '../data/create-6.0.10.json'
import type { GameData } from '../data/types'
import { createCatalog } from './catalog'
import { analyze } from './derive'
import { summaryCsv } from './export'
import { emptyPlan, type Plan } from './model/plan'

const catalog = createCatalog(data as GameData)
const at = { x: 0, y: 0 }

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
    { id: 'p', kind: 'power', source: 'water_wheel', position: at },
  ],
  edges: [
    { id: 'e', source: 'lava', target: 'fill', item: 'fluid:minecraft:lava' },
  ],
}

describe('summaryCsv', () => {
  it('lists every summary section as rows in the chosen time unit', () => {
    const csv = summaryCsv(analyze(plan, catalog), catalog, 'second')
    expect(csv.split('\r\n')).toEqual([
      'section,id,name,amount,unit',
      'input,fluid:minecraft:lava,Lava,166.667,mB/s',
      'input,minecraft:bucket,Bucket,0.167,items/s',
      'product,minecraft:lava_bucket,Lava Bucket,0.167,items/s',
      'machine,spout,Spout,1,machines',
      'stress,,Stress used,0,SU',
      'stress,,Stress capacity,0,SU',
      '',
    ])
  })

  it('quotes names with commas or quotes', () => {
    const named = {
      ...plan,
      nodes: [{ ...plan.nodes[0], perMinute: 30 }],
      edges: [],
    } as Plan
    const fake = {
      ...catalog,
      item: (id: string) => ({ id, name: 'Lava, "hot"' }),
    }
    expect(summaryCsv(analyze(named, catalog), fake, 'minute')).toContain(
      'input,fluid:minecraft:lava,"Lava, ""hot""",30,mB/min',
    )
  })
})
