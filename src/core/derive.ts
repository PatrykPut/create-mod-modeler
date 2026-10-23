// Everything the UI shows about a plan: solved rates plus machine counts, stress and totals.
import type { Catalog } from './catalog'
import { analyzeEdge, type EdgeAnalysis } from './logistics'
import {
  BLAZE_BURNER,
  DRILL,
  MACHINES,
  PUMP,
  type BuiltMachineId,
  type MachineConditions,
} from './machines'
import type { Plan, PowerNode, RecipeNode, SourceNode } from './model/plan'
import { analyzePower, type PowerAnalysis } from './power'
import { fuelOf } from './model/ports'
import { solve, type NodeResult, type SolveResult } from './solver/solve'

const EPSILON = 1e-9

export const DEFAULT_STACK_SIZE = 1
export const DEFAULT_PARALLEL_STACKS = 1

export interface MachineCount {
  exact: number
  count: number
  utilization: number
}

export interface NodeAnalysis {
  solved: NodeResult
  /** Recipe machines, or drills for sources of generated items; otherwise count 0. */
  machines: MachineCount
  /** SU, computed with the rounded-up machine count. */
  stress: number
  conditions?: MachineConditions
  /** Blaze Burners under the basins of a heated recipe (one per machine). */
  burners?: number
  /** The machine cannot run like this, e.g. too slow. */
  warning?: string
}

export interface ItemRate {
  item: string
  perMinute: number
}

export interface PlanAnalysis {
  ok: boolean
  nodes: Record<string, NodeAnalysis>
  edges: Record<string, EdgeAnalysis>
  power: Record<string, PowerAnalysis>
  summary: {
    /** Fixed/unlimited sources plus demand on unconnected inputs. */
    inputs: ItemRate[]
    /** Production on unconnected recipe outputs. */
    products: ItemRate[]
    surplus: ItemRate[]
    shortage: ItemRate[]
    machines: { machine: BuiltMachineId; count: number }[]
    /** SU used, including pumps of pipes and boilers. */
    stress: number
    /** SU supplied by the power nodes. */
    capacity: number
    /** Edges that need more than one belt, chute or pipe. */
    bottlenecks: { edge: string; item: string; lanes: number }[]
  }
}

export function conditionsOf(node: RecipeNode, plan: Plan): MachineConditions {
  return {
    rpm: node.rpm ?? plan.settings.rpm,
    stackSize: node.stackSize ?? DEFAULT_STACK_SIZE,
    parallelStacks: node.parallelStacks ?? DEFAULT_PARALLEL_STACKS,
  }
}

/** Drills per minute capacity for a source, or undefined when it is not drilled. */
export function drillCapacity(node: SourceNode, plan: Plan) {
  if (node.drill === false) return undefined
  return DRILL.blocksPerMinute(node.item, node.rpm ?? plan.settings.rpm)
}

function machineCount(runsPerMinute: number, capacity: number): MachineCount {
  const exact =
    capacity > 0 && Number.isFinite(capacity) ? runsPerMinute / capacity : 0
  const count = Math.max(0, Math.ceil(exact - EPSILON))
  return { exact, count, utilization: count ? exact / count : 0 }
}

function addRate(rates: Map<string, number>, item: string, perMinute: number) {
  if (perMinute > EPSILON) rates.set(item, (rates.get(item) ?? 0) + perMinute)
}

const sorted = (rates: Map<string, number>): ItemRate[] =>
  [...rates]
    .map(([item, perMinute]) => ({ item, perMinute }))
    .sort((a, b) => a.item.localeCompare(b.item))

/** Machine units a recipe node needs for its solved runs. */
function recipeMachines(
  node: RecipeNode,
  result: NodeResult,
  plan: Plan,
  catalog: Catalog,
): MachineCount {
  const recipe = catalog.recipe(node.recipeId)
  return machineCount(
    result.runsPerMinute,
    recipe
      ? MACHINES[node.machineId].runsPerMinute(recipe, conditionsOf(node, plan))
      : 0,
  )
}

/**
 * Blaze Burners burn fuel continuously, so their fuel depends on the rounded-up machine count:
 * solve once for the counts, then again with each heated node's burner fuel as a fixed demand.
 */
function solveWithBurners(plan: Plan, catalog: Catalog) {
  const first = solve(plan, catalog)
  const burners: Record<string, number> = {}
  for (const node of plan.nodes) {
    if (node.kind !== 'recipe' || !fuelOf(node, catalog)?.burner) continue
    burners[node.id] = recipeMachines(
      node,
      first.nodes[node.id],
      plan,
      catalog,
    ).count
  }
  const solved: SolveResult = Object.keys(burners).length
    ? solve(plan, catalog, { burners })
    : first
  return { solved, burners }
}

export function analyze(plan: Plan, catalog: Catalog): PlanAnalysis {
  const { solved, burners } = solveWithBurners(plan, catalog)
  const nodes: Record<string, NodeAnalysis> = {}
  const inputs = new Map<string, number>()
  const products = new Map<string, number>()
  const surplus = new Map<string, number>()
  const shortage = new Map<string, number>()
  const machineCounts = new Map<BuiltMachineId, number>()
  let totalStress = 0

  const build = (machine: BuiltMachineId, count: number, stress: number) => {
    totalStress += stress
    if (count)
      machineCounts.set(machine, (machineCounts.get(machine) ?? 0) + count)
  }

  for (const node of plan.nodes) {
    if (node.kind === 'power') continue
    const result = solved.nodes[node.id]
    for (const port of result.outputs) {
      // an unconnected source is just an input, not a product
      if (!port.connected && node.kind === 'recipe')
        addRate(products, port.item, port.perMinute)
      addRate(surplus, port.item, port.surplus)
    }
    for (const port of result.inputs) {
      if (!port.connected) addRate(inputs, port.item, port.perMinute)
      addRate(shortage, port.item, port.shortage)
    }

    if (node.kind === 'source') {
      addRate(inputs, node.item, result.runsPerMinute)
      const capacity = drillCapacity(node, plan)
      const machines = machineCount(result.runsPerMinute, capacity ?? 0)
      const stress =
        machines.count *
        DRILL.stressImpact *
        Math.abs(node.rpm ?? plan.settings.rpm)
      nodes[node.id] = { solved: result, machines, stress }
      build(DRILL.id, machines.count, stress)
      continue
    }

    const machine = MACHINES[node.machineId]
    const recipe = catalog.recipe(node.recipeId)
    const conditions = conditionsOf(node, plan)
    const machines = recipeMachines(node, result, plan, catalog)
    const blocks =
      recipe && machine.blocksPerUnit ? machine.blocksPerUnit(recipe) : 1
    const stress =
      machines.count * blocks * machine.stressImpact * Math.abs(conditions.rpm)
    const analysis: NodeAnalysis = {
      solved: result,
      machines,
      stress,
      conditions,
    }
    if (machine.basin) analysis.burners = burners[node.id] ?? 0
    if (machine.minRpm && Math.abs(conditions.rpm) < machine.minRpm)
      analysis.warning = `${machine.name} needs at least ${machine.minRpm} RPM.`
    nodes[node.id] = analysis
    build(node.machineId, machines.count, stress)
    if (analysis.burners) build(BLAZE_BURNER.id, analysis.burners, 0)
  }

  const edges: Record<string, EdgeAnalysis> = {}
  const bottlenecks: PlanAnalysis['summary']['bottlenecks'] = []
  for (const edge of plan.edges) {
    const analysis = analyzeEdge(
      edge,
      solved.edges[edge.id] ?? 0,
      plan.settings,
    )
    edges[edge.id] = analysis
    if (analysis.stress !== undefined)
      build(PUMP.id, analysis.lanes, analysis.stress)
    if (analysis.over)
      bottlenecks.push({
        edge: edge.id,
        item: edge.item,
        lanes: analysis.lanes,
      })
  }

  const power = analyzePower(
    plan.nodes.filter((n): n is PowerNode => n.kind === 'power'),
    totalStress,
    plan.settings.rpm,
  )
  let capacity = 0
  for (const node of plan.nodes) {
    if (node.kind !== 'power') continue
    const p = power[node.id]
    capacity += p.capacity
    build(node.source, p.count, p.stress)
    if (p.pumps) build(PUMP.id, p.pumps, 0)
  }

  return {
    ok: solved.ok,
    nodes,
    edges,
    power,
    summary: {
      inputs: sorted(inputs),
      products: sorted(products),
      surplus: sorted(surplus),
      shortage: sorted(shortage),
      machines: [...machineCounts].map(([machine, count]) => ({
        machine,
        count,
      })),
      stress: totalStress,
      capacity,
      bottlenecks,
    },
  }
}
