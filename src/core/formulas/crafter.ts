// Source: content/kinetics/crafter/MechanicalCrafterBlockEntity.java (tick, getCountDownSpeed).

const EXPORT_TIMER = 1000
const CRAFT_TIMER = 2000

/**
 * Approximate ticks per craft for a grid of `crafters`, assuming one snake path through all of
 * them (every crafter hands its item to the next). Refilling the grid is not included.
 */
export function crafterCycleTicks(crafters: number, rpm: number): number {
  if (rpm === 0) return Infinity
  const speed = Math.min(250, Math.max(4, Math.trunc(Math.abs(rpm))))
  const handOffs = Math.max(0, crafters - 1)
  return (
    handOffs * (Math.floor(EXPORT_TIMER / speed) + 2) +
    Math.floor(CRAFT_TIMER / speed) +
    2
  )
}
