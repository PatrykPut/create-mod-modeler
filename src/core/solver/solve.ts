// Turns a plan into one linear program (see docs/IMPLEMENTATION.md "Solver").
import { solve as solveLp, type Coefficients, type Constraint } from 'yalps'
import type { Catalog } from '../catalog'
import { targetPortOf, type Plan, type PlanEdge } from '../model/plan'
import { portsOf, type PortOptions } from '../model/ports'

export interface PortResult {
  item: string
  /** Total production (outputs) or consumption (inputs) per minute. */
  perMinute: number
  chance?: number
  /** Fuel port of a heated basin or furnace. */
  fuel?: boolean
  connected: boolean
  /** Inputs: demand the connected suppliers cannot cover. */
  shortage: number
  /** Outputs: production the connected consumers do not take. */
  surplus: number
}

export interface NodeResult {
  /** Recipe executions per minute (sources: items per minute). */
  runsPerMinute: number
  inputs: PortResult[]
  outputs: PortResult[]
}

export interface SolveResult {
  ok: boolean
  nodes: Record<string, NodeResult>
  /** Flow per minute, by edge id. */
  edges: Record<string, number>
}

const SHORTAGE_COST = 1e4
const SURPLUS_COST = 1
// tie-breaker that splits an output evenly when consumers are otherwise indifferent
const IMBALANCE_COST = 1e-3

const portKey = (node: string, side: 'in' | 'out', item: string) =>
  `port:${node}:${side}:${item}`

export function solve(
  plan: Plan,
  catalog: Catalog,
  options: PortOptions = {},
): SolveResult {
  const constraints = new Map<string, Constraint>()
  const variables = new Map<string, Coefficients<string>>()
  const addTo = (variable: string, constraint: string, coefficient: number) => {
    const coefficients = variables.get(variable) as Map<string, number>
    coefficients.set(
      constraint,
      (coefficients.get(constraint) ?? 0) + coefficient,
    )
  }
  const variable = (name: string, cost = 0) =>
    variables.set(name, new Map(cost ? [['cost', cost]] : []))

  const edgesInto = new Map<string, PlanEdge[]>()
  const edgesOutOf = new Map<string, PlanEdge[]>()
  for (const edge of plan.edges) {
    const into = portKey(edge.target, 'in', targetPortOf(edge))
    const outOf = portKey(edge.source, 'out', edge.item)
    edgesInto.set(into, [...(edgesInto.get(into) ?? []), edge])
    edgesOutOf.set(outOf, [...(edgesOutOf.get(outOf) ?? []), edge])
    variable(`flow:${edge.id}`)
  }

  const ports = new Map(
    plan.nodes.map((node) => [node.id, portsOf(node, catalog, options)]),
  )

  for (const node of plan.nodes) {
    const run = `run:${node.id}`
    variable(run)
    const { inputs, outputs } = ports.get(node.id)!

    // production = Σ outgoing flow + surplus (unconnected outputs are free products)
    for (const port of outputs) {
      const key = portKey(node.id, 'out', port.item)
      const edges = edgesOutOf.get(key)
      if (!edges) continue
      // fixed amounts (e.g. burner fuel) do not scale with the runs
      constraints.set(key, { equal: -(port.fixed ?? 0) })
      addTo(run, key, port.perRun)
      for (const edge of edges) addTo(`flow:${edge.id}`, key, -1)
      variable(`surplus:${key}`, SURPLUS_COST)
      addTo(`surplus:${key}`, key, -1)
      if (edges.length > 1) addBalance(key, edges)
    }

    // consumption = Σ incoming flow + shortage (unconnected inputs are external supply)
    for (const port of inputs) {
      const key = portKey(node.id, 'in', port.item)
      const edges = edgesInto.get(key)
      if (!edges) continue
      constraints.set(key, { equal: -(port.fixed ?? 0) })
      addTo(run, key, port.perRun)
      for (const edge of edges) addTo(`flow:${edge.id}`, key, -1)
      variable(`shortage:${key}`, SHORTAGE_COST)
      addTo(`shortage:${key}`, key, -1)
    }

    if (node.kind === 'source' && node.perMinute !== null) {
      constraints.set(`fixed:${node.id}`, { equal: node.perMinute })
      addTo(run, `fixed:${node.id}`, 1)
    }
    if (node.kind === 'recipe' && node.target) {
      const port = outputs.find((p) => p.item === node.target!.item)
      if (port) {
        constraints.set(`target:${node.id}`, { equal: node.target.perMinute })
        addTo(run, `target:${node.id}`, port.perRun)
      }
    }
  }

  /** |flow_e − total / k| ≤ d_e, with a small cost on d_e. */
  function addBalance(key: string, edges: PlanEdge[]) {
    const share = 1 / edges.length
    for (const edge of edges) {
      const d = `imbalance:${key}:${edge.id}`
      variable(d, IMBALANCE_COST)
      for (const [suffix, sign] of [
        ['+', 1],
        ['-', -1],
      ] as const) {
        const c = `${d}:${suffix}`
        constraints.set(c, { min: 0 })
        addTo(d, c, 1)
        for (const other of edges)
          addTo(
            `flow:${other.id}`,
            c,
            sign * ((other === edge ? -1 : 0) + share),
          )
      }
    }
  }

  const solution = solveLp({
    direction: 'minimize',
    objective: 'cost',
    constraints,
    variables,
  })
  const value = new Map(solution.variables)
  const get = (name: string) => value.get(name) ?? 0

  const nodes: Record<string, NodeResult> = {}
  for (const node of plan.nodes) {
    const runs = get(`run:${node.id}`)
    const { inputs, outputs } = ports.get(node.id)!
    const result = (side: 'in' | 'out') => (port: (typeof inputs)[number]) => {
      const key = portKey(node.id, side, port.item)
      const connected = (side === 'in' ? edgesInto : edgesOutOf).has(key)
      return {
        item: port.item,
        perMinute: runs * port.perRun + (port.fixed ?? 0),
        ...(port.chance !== undefined && { chance: port.chance }),
        ...(port.fuel && { fuel: true }),
        connected,
        shortage: side === 'in' ? get(`shortage:${key}`) : 0,
        surplus: side === 'out' ? get(`surplus:${key}`) : 0,
      }
    }
    nodes[node.id] = {
      runsPerMinute: runs,
      inputs: inputs.map(result('in')),
      outputs: outputs.map(result('out')),
    }
  }

  return {
    ok: solution.status === 'optimal',
    nodes,
    edges: Object.fromEntries(
      plan.edges.map((e) => [e.id, get(`flow:${e.id}`)]),
    ),
  }
}
