import { describe, expect, it } from 'vitest'
import { crushingCycleTicks } from './crushing'
import { drillCycleTicks } from './drill'
import { fanCycleTicks } from './fan'
import { millstoneCycleTicks } from './millstone'
import { pressCycleTicks } from './press'
import { crafterCycleTicks } from './crafter'
import { deployerCycleTicks } from './deployer'
import { mixerCycleTicks } from './mixer'
import { sawCycleTicks } from './saw'

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

describe('mechanical mixer', () => {
  it('processes one recipe every P + 1 ticks while running continuously', () => {
    // P = floor(log2(floor(512 / rpm))) * ceil(15 * T / 100) + 1, T defaults to 100
    expect(mixerCycleTicks(undefined, 256)).toBe(17)
    expect(mixerCycleTicks(undefined, 128)).toBe(32)
    expect(mixerCycleTicks(undefined, 64)).toBe(47)
    expect(mixerCycleTicks(undefined, 30)).toBe(62)
  })

  it('scales with the recipe processing time', () => {
    // brass: no time → factor 15; T = 200 → factor 30
    expect(mixerCycleTicks(200, 64)).toBe(3 * 30 + 1 + 1)
  })

  it('is as fast as possible from 512 RPM and stops below 30 RPM', () => {
    expect(mixerCycleTicks(undefined, 512)).toBe(2)
    expect(mixerCycleTicks(undefined, 29)).toBe(Infinity)
  })
})

describe('mechanical saw', () => {
  it('cuts after floor((T - 5) / s) + 1 ticks and outputs ceil(20 / s) later', () => {
    // s = rpm / 24 = 10.67 at 256 RPM
    expect(sawCycleTicks(50, 256)).toBe(5 + 2)
    // s = 1.33 at 32 RPM: 34 + 15
    expect(sawCycleTicks(50, 32)).toBe(49)
  })

  it('clamps the speed to 1..128 per tick', () => {
    expect(sawCycleTicks(50, 8)).toBe(46 + 20)
    expect(sawCycleTicks(200, 4096)).toBe(2 + 1)
    expect(sawCycleTicks(50, 0)).toBe(Infinity)
  })
})

describe('deployer', () => {
  it('needs 2 * ceil(1000 / v) + 2 ticks per item on a belt or depot', () => {
    // v = clamp(2 * rpm, 8, 512)
    expect(deployerCycleTicks(256)).toBe(6)
    expect(deployerCycleTicks(64)).toBe(18)
    expect(deployerCycleTicks(1)).toBe(252)
    expect(deployerCycleTicks(0)).toBe(Infinity)
  })
})

describe('mechanical crafter', () => {
  it('hands items along a snake through the grid, then crafts', () => {
    // 3×3 snake: 8 hand-offs of floor(1000 / 250) + 2, crafting floor(2000 / 250) + 2
    expect(crafterCycleTicks(9, 256)).toBe(8 * 6 + 10)
    // speed is clamped to at least 4
    expect(crafterCycleTicks(2, 1)).toBe(252 + 502)
    expect(crafterCycleTicks(1, 0)).toBe(Infinity)
  })
})
