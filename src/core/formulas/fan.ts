// Source: content/kinetics/fan/processing/FanProcessing.java (applyProcessing),
// config CKinetics.fanProcessingTime (default 150).

const FAN_PROCESSING_TIME = 150

/**
 * Ticks a stack has to stay in a fan's air current to be processed (bulk washing,
 * smoking, blasting, haunting). Independent of RPM, which only changes the range.
 */
export function fanCycleTicks(stackSize: number): number {
  const stackModifier = Math.trunc((stackSize - 1) / 16) + 1
  // one tick sets the timer, it counts down to 0, one more tick processes
  return FAN_PROCESSING_TIME * stackModifier + 1 + 2
}
