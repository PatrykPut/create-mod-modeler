import { describe, expect, it } from 'vitest'
import { conditionsMet } from './conditions.ts'

const loaded = new Set(['minecraft', 'create', 'createaddition'])
const modLoaded = (modid: string) => ({ type: 'neoforge:mod_loaded', modid })

describe('conditionsMet', () => {
  it('passes recipes without conditions', () => {
    expect(conditionsMet(undefined, loaded)).toBe(true)
    expect(conditionsMet([], loaded)).toBe(true)
  })

  it('checks loaded mods; all conditions of a list must hold', () => {
    expect(conditionsMet([modLoaded('createaddition')], loaded)).toBe(true)
    expect(
      conditionsMet([modLoaded('create'), modLoaded('mekanism')], loaded),
    ).toBe(false)
  })

  it('evaluates not, and, or, true and false', () => {
    const not = { type: 'neoforge:not', value: modLoaded('mekanism') }
    const or = {
      type: 'neoforge:or',
      values: [modLoaded('mekanism'), modLoaded('create')],
    }
    const and = {
      type: 'neoforge:and',
      values: [modLoaded('create'), { type: 'neoforge:false' }],
    }
    expect(conditionsMet([not, or, { type: 'neoforge:true' }], loaded)).toBe(
      true,
    )
    expect(conditionsMet([and], loaded)).toBe(false)
  })

  it('fails unknown or malformed conditions', () => {
    expect(conditionsMet([{ type: 'othermod:config' }], loaded)).toBe(false)
    expect(conditionsMet('nope', loaded)).toBe(false)
  })
})
