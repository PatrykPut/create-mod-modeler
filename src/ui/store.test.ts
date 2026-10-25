import { beforeEach, describe, expect, it } from 'vitest'
import { emptyPlan, type Plan } from '../core/model/plan'
import { migrate, uniqueName, usePlanStore } from './store'

const plan: Plan = { ...emptyPlan(), settings: { rpm: 64, timeUnit: 'hour' } }
const store = usePlanStore.getState

describe('migrate', () => {
  it('turns the single plan of version 1 into the first named plan', () => {
    const { currentId, library } = migrate({ plan }, 1)
    expect(library[currentId]).toMatchObject({ name: 'My plan', plan })
    expect(Object.keys(library)).toHaveLength(1)
  })

  it('removes sources from version 2 that no farm or generator makes', () => {
    const boat: Plan = {
      ...plan,
      nodes: [
        {
          id: 'b',
          kind: 'source',
          item: 'minecraft:acacia_boat',
          perMinute: 1,
          position: { x: 0, y: 0 },
        },
      ],
    }
    const saved = { id: 'x', name: 'Boats', updatedAt: 1, plan: boat }
    const { library } = migrate({ currentId: 'x', library: { x: saved } }, 2)
    expect(library.x.plan.nodes).toEqual([])
    expect(library.x.name).toBe('Boats')
  })
})

describe('uniqueName', () => {
  it('numbers names that are taken', () => {
    expect(uniqueName('Iron', [])).toBe('Iron')
    expect(uniqueName('Iron', ['Iron', 'Iron (2)'])).toBe('Iron (3)')
  })
})

describe('plan library', () => {
  beforeEach(() => store().importPlan('Start', emptyPlan()))

  it('keeps edits of the open plan in the library', () => {
    store().updateSettings({ rpm: 32 })
    const { currentId, library } = store()
    expect(library[currentId].plan.settings.rpm).toBe(32)
  })

  it('switches, duplicates and deletes plans', () => {
    const first = store().currentId
    const name = store().library[first].name
    store().updateSettings({ rpm: 16 })
    store().duplicatePlan(first)
    const copy = store().currentId
    expect(store().library[copy].name).toBe(`${name} copy`)
    expect(store().plan.settings.rpm).toBe(16)

    store().updateSettings({ rpm: 128 })
    store().openPlan(first)
    expect(store().plan.settings.rpm).toBe(16)

    store().deletePlan(first)
    expect(store().library[first]).toBeUndefined()
    expect(store().currentId).not.toBe(first)
  })

  it('imports a plan under a free name and opens it', () => {
    store().importPlan('Start', plan)
    expect(store().library[store().currentId].name).toMatch(/^Start \(\d+\)$/)
    expect(store().plan).toEqual(plan)
  })
})
