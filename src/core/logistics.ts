// Transport limits of edges (DESIGN §4.3).
import {
  beltItemsPerMinute,
  chuteItemsPerMinute,
  pipeMbPerMinute,
} from './formulas/transport'
import { PUMP } from './machines'
import type { PlanEdge, Settings, Transport } from './model/plan'

const EPSILON = 1e-9
export const DEFAULT_ITEMS_PER_ENTRY = 1

/** What each transport type assumes, for the UI. */
export const TRANSPORT_NOTES: Record<Transport['type'] | 'ideal', string> = {
  ideal: 'No limit. Choose belt, chute or pipe to check the throughput.',
  belt: 'One belt at its RPM. Delays where machines take items on or off the belt are not counted.',
  chute:
    'Items fall by gravity, 4 entries per second. Fans on the chute are not modelled.',
  pipe: 'One mechanical pump per pipe, at the pump RPM; its stress is added. Pipe range is not checked.',
}

export interface EdgeAnalysis {
  /** Items (fluids: mB) per minute. */
  flow: number
  /** Per lane (one belt, chute or pipe); absent for ideal edges. */
  limit?: number
  /** Parallel belts, chutes or pipes needed for the flow. */
  lanes: number
  over: boolean
  /** Pipes: SU of the pump on each lane. */
  stress?: number
}

/** Per-lane capacity per minute, or undefined for an ideal edge. */
export function edgeLimit(
  edge: PlanEdge,
  settings: Settings,
): number | undefined {
  const transport = edge.transport
  if (!transport) return undefined
  const rpm = transport.rpm ?? settings.rpm
  const perEntry = transport.itemsPerEntry ?? DEFAULT_ITEMS_PER_ENTRY
  switch (transport.type) {
    case 'belt':
      return beltItemsPerMinute(rpm, perEntry)
    case 'chute':
      return chuteItemsPerMinute(perEntry)
    case 'pipe':
      return pipeMbPerMinute(rpm)
  }
}

export function analyzeEdge(
  edge: PlanEdge,
  flow: number,
  settings: Settings,
): EdgeAnalysis {
  const limit = edgeLimit(edge, settings)
  if (limit === undefined) return { flow, lanes: 1, over: false }
  const lanes =
    limit > 0 ? Math.max(1, Math.ceil(flow / limit - EPSILON)) : Infinity
  const analysis: EdgeAnalysis = { flow, limit, lanes, over: lanes > 1 }
  if (edge.transport?.type === 'pipe')
    analysis.stress =
      lanes * PUMP.stressImpact * Math.abs(edge.transport.rpm ?? settings.rpm)
  return analysis
}
