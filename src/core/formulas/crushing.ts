// Source: content/kinetics/crusher/CrushingWheelControllerBlockEntity.java (tick, itemInserted)
// and CrushingWheelControllerBlock.java (crushingspeed = |RPM| / 50).

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

/**
 * Ticks for one pair of crushing wheels to process a stack of `stackSize` items.
 * The whole stack is processed at once.
 */
export function crushingCycleTicks(
  processingTime: number,
  rpm: number,
  stackSize: number,
): number {
  if (rpm === 0) return Infinity
  const speed = (Math.abs(rpm) / 50) * 4
  // before the recipe is applied the speed is divided by log2(count);
  // a single item divides by 0 and is clamped to the maximum of 20
  const beforeApply = clamp(speed / Math.log2(stackSize), 0.25, 20)
  const afterApply = clamp(speed, 0.25, 20)

  let remaining = processingTime
  let applied = false
  let ticks = 0
  for (;;) {
    ticks++
    remaining -= applied ? afterApply : beforeApply
    if (!applied && remaining < 20) {
      applied = true
      continue
    }
    if (remaining <= 0) return ticks
  }
}
