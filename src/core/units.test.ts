import { describe, expect, it } from 'vitest'
import { fromPerMinute, perMinuteFromTicks, toPerMinute } from './units'

describe('time units', () => {
  it('converts per-minute rates for display', () => {
    expect(fromPerMinute(60, 'second')).toBe(1)
    expect(fromPerMinute(60, 'minute')).toBe(60)
    expect(fromPerMinute(60, 'hour')).toBe(3600)
  })

  it('round-trips user input back to per minute', () => {
    expect(toPerMinute(fromPerMinute(7.5, 'second'), 'second')).toBeCloseTo(7.5)
    expect(toPerMinute(450, 'hour')).toBe(7.5)
  })

  it('derives rates from tick cycles', () => {
    // optimised cobble gen at 256 RPM: one block every 11 ticks ≈ 109/min (DESIGN §4.1)
    expect(perMinuteFromTicks(11)).toBeCloseTo(109.09, 2)
  })
})
