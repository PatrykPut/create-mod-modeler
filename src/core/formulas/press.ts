// Source: content/kinetics/press/PressingBehaviour.java (tick, getRunningTickSpeed).

const CYCLE = 240

/**
 * Ticks for one press stroke: down to CYCLE/2 (clamped), apply, back up past CYCLE,
 * one finishing tick. Applies to belt/depot pressing and basin compacting alike.
 * Restart delay between strokes on a basin is assumed to be 0.
 */
export function pressCycleTicks(rpm: number): number {
  if (rpm === 0) return Infinity
  const step = Math.trunc(1 + 59 * Math.min(Math.abs(rpm) / 512, 1))
  const half = CYCLE / 2
  return Math.ceil(half / step) + Math.floor(half / step) + 1 + 1
}
