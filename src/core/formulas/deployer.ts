// Source: content/kinetics/deployer/DeployerBlockEntity.java (tick, getTimerSpeed),
// BeltDeployerCallbacks.java (whenItemHeld starts the deployer at once).

const EXTEND_TIMER = 1000

/** Ticks per item for a deployer over a belt or depot: extend, apply, retract. */
export function deployerCycleTicks(rpm: number): number {
  if (rpm === 0) return Infinity
  const speed = Math.trunc(Math.min(512, Math.max(8, 2 * Math.abs(rpm))))
  return 2 * Math.ceil(EXTEND_TIMER / speed) + 2
}
