// Source: content/kinetics/saw/SawBlockEntity.java (tick, start, getProcessingSpeed).

/**
 * Ticks from accepting one item to dropping the result: the timer starts at T and loses
 * s = clamp(RPM / 24, 1, 128) per tick; below 5 the recipe applies and the timer restarts at 20.
 */
export function sawCycleTicks(processingTime: number, rpm: number): number {
  if (rpm === 0) return Infinity
  const speed = Math.min(128, Math.max(1, Math.abs(rpm) / 24))
  const cutting =
    processingTime <= 5 ? 1 : Math.floor((processingTime - 5) / speed) + 1
  return cutting + Math.ceil(20 / speed)
}
