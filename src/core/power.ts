// Stress sources. Capacities from AllBlocks.java (CStress.setCapacity); see formulas/power.ts.
import {
  boilerFor,
  STEAM_ENGINE_STRESS,
  windmillStress,
  type BoilerSetup,
} from './formulas/power'
import type { MachineBlock } from './blocks'
import { PUMP } from './machines'
import type { PowerNode, PowerSourceId } from './model/plan'

export const DEFAULT_SAILS = 8

export interface PowerSourceDef {
  id: PowerSourceId
  name: string
  /** Block shown as the source's icon. */
  block: MachineBlock
  usesSails?: boolean
  /** Creative motor speed / steam engine pump speed. */
  usesRpm?: boolean
  note?: string
  /** SU one unit supplies. */
  stressPerUnit(node: PowerNode, globalRpm: number): number
}

export const POWER_SOURCES: Record<PowerSourceId, PowerSourceDef> = {
  water_wheel: {
    id: 'water_wheel',
    name: 'Water Wheel',
    block: 'create:water_wheel',
    note: '32 SU/RPM at 8 RPM, with flowing water on one side.',
    stressPerUnit: () => 32 * 8,
  },
  large_water_wheel: {
    id: 'large_water_wheel',
    name: 'Large Water Wheel',
    block: 'create:large_water_wheel',
    note: '128 SU/RPM at 4 RPM, with flowing water on one side.',
    stressPerUnit: () => 128 * 4,
  },
  windmill: {
    id: 'windmill',
    name: 'Windmill',
    block: 'create:windmill_bearing',
    usesSails: true,
    note: '512 SU/RPM; 1 RPM per 8 sail blocks, at most 16 RPM.',
    stressPerUnit: (node) => windmillStress(node.sails ?? DEFAULT_SAILS),
  },
  hand_crank: {
    id: 'hand_crank',
    name: 'Hand Crank',
    block: 'create:hand_crank',
    note: '8 SU/RPM at 32 RPM while a player turns it.',
    stressPerUnit: () => 8 * 32,
  },
  creative_motor: {
    id: 'creative_motor',
    name: 'Creative Motor',
    block: 'create:creative_motor',
    usesRpm: true,
    note: '16384 SU/RPM at its set speed.',
    stressPerUnit: (node, globalRpm) => 16384 * Math.abs(node.rpm ?? globalRpm),
  },
  steam_engine: {
    id: 'steam_engine',
    name: 'Steam Engine',
    block: 'create:steam_engine',
    usesRpm: true,
    note: '16384 SU per engine at full efficiency: the boiler needs one level per engine (up to 18). Its water pumps (1 up to level 12, 2 from level 13) count as stress at the pump RPM. Heat sources, water and tank size are not modelled.',
    stressPerUnit: () => STEAM_ENGINE_STRESS,
  },
}

const EPSILON = 1e-9
// enough rounds for steam engines whose own pumps push the demand over another engine
const MAX_ROUNDS = 20

export interface PowerAnalysis {
  count: number
  /** SU this node supplies. */
  capacity: number
  /** Steam engine: SU of the boiler's water pumps. */
  stress: number
  boiler?: BoilerSetup
  pumps?: number
}

function boilerPumps(node: PowerNode, count: number, globalRpm: number) {
  if (node.source !== 'steam_engine') return undefined
  const boiler = boilerFor(count)
  const pumps = boiler.boilers * boiler.pumpsPerBoiler
  return {
    boiler,
    pumps,
    stress: pumps * PUMP.stressImpact * Math.abs(node.rpm ?? globalRpm),
  }
}

/**
 * Units of every power node. Fixed counts go first; the remaining stress is split evenly
 * between the nodes without a count, each built up to cover its share.
 */
export function analyzePower(
  nodes: PowerNode[],
  demand: number,
  globalRpm: number,
): Record<string, PowerAnalysis> {
  const unit = (node: PowerNode) =>
    POWER_SOURCES[node.source].stressPerUnit(node, globalRpm)
  const auto = nodes.filter((n) => n.count === undefined)
  const counts = new Map(nodes.map((n) => [n.id, n.count ?? 0]))

  const result = () =>
    Object.fromEntries(
      nodes.map((node) => {
        const count = counts.get(node.id)!
        const steam = boilerPumps(node, count, globalRpm)
        return [
          node.id,
          {
            count,
            capacity: count * unit(node),
            stress: steam?.stress ?? 0,
            ...(steam && { boiler: steam.boiler, pumps: steam.pumps }),
          },
        ]
      }),
    ) as Record<string, PowerAnalysis>

  for (let round = 0; round < MAX_ROUNDS && auto.length; round++) {
    const current = result()
    const pumps = Object.values(current).reduce((sum, p) => sum + p.stress, 0)
    const fixed = nodes
      .filter((n) => n.count !== undefined)
      .reduce((sum, n) => sum + current[n.id].capacity, 0)
    const share = Math.max(0, demand + pumps - fixed) / auto.length
    let changed = false
    for (const node of auto) {
      const count = Math.max(0, Math.ceil(share / unit(node) - EPSILON))
      if (count !== counts.get(node.id)) changed = true
      counts.set(node.id, count)
    }
    if (!changed) break
  }
  return result()
}
