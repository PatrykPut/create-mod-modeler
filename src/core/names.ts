import {
  BLAZE_BURNER,
  DRILL,
  MACHINES,
  PUMP,
  type BuiltMachineId,
  type MachineId,
} from './machines'
import type { PowerSourceId } from './model/plan'
import { POWER_SOURCES } from './power'

const NAMES: Record<string, string> = {
  [DRILL.id]: DRILL.name,
  [BLAZE_BURNER.id]: BLAZE_BURNER.name,
  [PUMP.id]: PUMP.name,
}

/** Display name of anything in the machine list. */
export function machineName(id: BuiltMachineId): string {
  if (NAMES[id]) return NAMES[id]
  if (id in POWER_SOURCES) return POWER_SOURCES[id as PowerSourceId].name
  return MACHINES[id as MachineId].name
}
