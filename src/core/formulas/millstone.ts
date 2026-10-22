// Source: content/kinetics/millstone/MillstoneBlockEntity.java (tick, getProcessingSpeed).

/** Ticks for one millstone to mill one item, including the tick that starts the timer. */
export function millstoneCycleTicks(
  processingTime: number,
  rpm: number,
): number {
  if (rpm === 0) return Infinity
  const speed = Math.min(512, Math.max(1, Math.trunc(Math.abs(rpm) / 16)))
  return 1 + Math.ceil(processingTime / speed)
}
