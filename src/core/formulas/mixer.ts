// Source: content/kinetics/mixer/MechanicalMixerBlockEntity.java (tick, getMinimumRequiredSpeedLevel),
// processing/basin/BasinOperatingBlockEntity.java (continueWithPreviousRecipe).

/** MechanicalMixerBlock needs SpeedLevel MEDIUM (CKinetics.mediumSpeed). */
export const MIXER_MIN_RPM = 30
// recipes without processing_time (and shapeless crafting) count as 100 ticks
const DEFAULT_PROCESSING_TIME = 100

/**
 * Ticks per recipe while the mixer keeps running on the same recipe: `processingTicks` is set
 * one tick after the previous apply and counts down to 0.
 */
export function mixerCycleTicks(
  processingTime: number | undefined,
  rpm: number,
): number {
  const speed = Math.abs(rpm)
  if (speed < MIXER_MIN_RPM) return Infinity
  const time = processingTime || DEFAULT_PROCESSING_TIME
  const factor = Math.ceil((15 * time) / 100)
  const halvings = Math.floor(Math.log2(Math.floor(512 / speed)))
  const processingTicks = Math.max(
    (Number.isFinite(halvings) ? halvings : 0) * factor + 1,
    1,
  )
  return processingTicks + 1
}
