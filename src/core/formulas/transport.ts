// Sources: content/kinetics/belt/BeltBlockEntity.java (getBeltMovementSpeed),
// belt/transport/BeltInventory.java (spacing), content/logistics/chute/ChuteBlockEntity.java
// (getItemMotion), content/fluids/FluidNetwork.java (transferSpeed).
import { TICKS_PER_SECOND } from '../units'

const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
// belt items move RPM / 480 blocks per tick and keep 1 block between entries
const BELT_SPEED_DIVISOR = 480
// chutes hold one stack each; gravity moves items 4 chutes per second
const CHUTE_GRAVITY_PER_SECOND = 4

/** Items per minute one belt carries at full speed. */
export function beltItemsPerMinute(rpm: number, itemsPerEntry: number) {
  return (TICKS_PER_MINUTE * Math.abs(rpm) * itemsPerEntry) / BELT_SPEED_DIVISOR
}

/** Items per minute one chute carries downwards without a fan. */
export function chuteItemsPerMinute(itemsPerEntry: number) {
  return 60 * CHUTE_GRAVITY_PER_SECOND * itemsPerEntry
}

/** mB per minute one pump pushes through a pipe without branches. */
export function pipeMbPerMinute(rpm: number) {
  if (rpm === 0) return 0
  return TICKS_PER_MINUTE * Math.max(1, Math.trunc(Math.abs(rpm) / 2))
}
