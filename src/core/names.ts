import type { MachineBlock } from './blocks'
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

const OTHERS: Record<string, { name: string; block: MachineBlock }> = {
  [DRILL.id]: DRILL,
  [BLAZE_BURNER.id]: BLAZE_BURNER,
  [PUMP.id]: PUMP,
}

function machine(id: BuiltMachineId): { name: string; block: MachineBlock } {
  if (OTHERS[id]) return OTHERS[id]
  if (id in POWER_SOURCES) return POWER_SOURCES[id as PowerSourceId]
  return MACHINES[id as MachineId]
}

/** Display name of anything in the machine list. */
export const machineName = (id: BuiltMachineId): string => machine(id).name

/** Block shown as the icon of anything in the machine list. */
export const machineBlock = (id: BuiltMachineId): MachineBlock =>
  machine(id).block
