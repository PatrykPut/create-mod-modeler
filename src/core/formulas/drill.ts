// Source: content/kinetics/base/BlockBreakingKineticBlockEntity.java (tick, lazyTick, getBreakSpeed),
// foundation/blockEntity/SmartBlockEntity.java (lazy tick every 10 + 1 ticks),
// content/kinetics/drill/DrillBlockEntity.java (optimiseCobbleGen).

const LAZY_TICK_RATE = 10
const SAMPLE_BLOCKS = 20

/**
 * Average ticks per block for a drill on an optimised generator: the drops go straight into
 * the belt/hopper/chute, so the next block is there immediately. After each break the drill
 * idles until its next lazy tick, which caps it at one block every 11 ticks.
 * Simulated tick by tick because hits and lazy ticks interleave.
 */
export function drillCycleTicks(hardness: number, rpm: number): number {
  if (rpm === 0) return Infinity
  const breakSpeed = Math.abs(rpm) / 100

  let lazyCounter = LAZY_TICK_RATE
  let ticksUntilNextProgress = -1
  let progress = 0
  const breaks: number[] = []

  for (let tick = 0; breaks.length <= SAMPLE_BLOCKS; tick++) {
    if (lazyCounter-- <= 0) {
      lazyCounter = LAZY_TICK_RATE
      if (ticksUntilNextProgress === -1) ticksUntilNextProgress = 1
    }
    if (ticksUntilNextProgress < 0) continue
    if (ticksUntilNextProgress-- > 0) continue

    progress += Math.min(
      10 - progress,
      Math.max(1, Math.trunc(breakSpeed / hardness)),
    )
    if (progress >= 10) {
      breaks.push(tick)
      progress = 0
      ticksUntilNextProgress = -1
      continue
    }
    ticksUntilNextProgress = Math.trunc(hardness / breakSpeed)
  }

  return (breaks[SAMPLE_BLOCKS] - breaks[0]) / SAMPLE_BLOCKS
}
