import { describe, expect, it } from 'vitest'
import { crushingCycleTicks } from './crushing'
import { drillCycleTicks } from './drill'
import { fanCycleTicks } from './fan'
import { millstoneCycleTicks } from './millstone'
import { pressCycleTicks } from './press'

describe('crushing wheels', () => {
  it('single items: phase 1 runs at the 20/tick cap, phase 2 at RPM speed', () => {
    // T=250 at 256 RPM: 12 ticks to drop below 20, 1 tick to finish
    expect(crushingCycleTicks(250, 256, 1)).toBe(13)
    // at 16 RPM phase 2 only removes 1.28/tick: 12 + ceil(10 / 1.28)
    expect(crushingCycleTicks(250, 16, 1)).toBe(20)
  })

  it('stacks slow down phase 1 by log2(stack size)', () => {
    // 256 RPM, 64 items: 20.48 / 6 per tick → 68 ticks, then 1 tick
    expect(crushingCycleTicks(250, 256, 64)).toBe(69)
  })

  it('never processes without rotation', () => {
    expect(crushingCycleTicks(250, 0, 1)).toBe(Infinity)
  })
})

describe('millstone', () => {
  it('one start tick plus ceil(T / speed) with speed = RPM / 16', () => {
    expect(millstoneCycleTicks(250, 256)).toBe(17)
    expect(millstoneCycleTicks(250, 32)).toBe(126)
  })

  it('speed is at least 1 per tick', () => {
    expect(millstoneCycleTicks(100, 8)).toBe(101)
    expect(millstoneCycleTicks(100, 0)).toBe(Infinity)
  })
})

describe('encased fan', () => {
  it('is independent of RPM and grows every 16 items', () => {
    expect(fanCycleTicks(1)).toBe(153)
    expect(fanCycleTicks(16)).toBe(153)
    expect(fanCycleTicks(17)).toBe(303)
    expect(fanCycleTicks(64)).toBe(603)
  })
})

describe('mechanical drill (optimised cobble generator)', () => {
  it('matches the cobblestone table in DESIGN §4.1', () => {
    expect(drillCycleTicks(2, 16)).toBe(121)
    expect(drillCycleTicks(2, 32)).toBe(66)
    expect(drillCycleTicks(2, 64)).toBe(44)
    expect(drillCycleTicks(2, 128)).toBe(22)
    expect(drillCycleTicks(2, 256)).toBe(11)
  })

  it('is capped by the 11-tick lazy tick for soft blocks', () => {
    expect(drillCycleTicks(1.25, 256)).toBe(11)
  })

  it('never breaks without rotation', () => {
    expect(drillCycleTicks(2, 0)).toBe(Infinity)
  })
})

describe('mechanical press', () => {
  it('runs a 240-unit cycle with step 1 + 59·min(RPM/512, 1)', () => {
    // 256 RPM: step 30 → 4 ticks down, 5 ticks back up, 1 finishing tick
    expect(pressCycleTicks(256)).toBe(10)
    // 16 RPM: step 2 → 60 + 61 + 1
    expect(pressCycleTicks(16)).toBe(122)
    expect(pressCycleTicks(0)).toBe(Infinity)
  })
})
