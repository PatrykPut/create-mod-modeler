// Everything the UI shows about a plan: solved rates plus machine counts, stress and totals.
import type { Catalog } from './catalog'
import {
  DRILL,
  MACHINES,
  type BuiltMachineId,
  type MachineConditions,
} from './machines'
import type { Plan, RecipeNode, SourceNode } from './model/plan'
import { solve, type NodeResult } from './solver/solve'

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
}

export interface ItemRate {
  item: string
  perMinute: number
}

export interface PlanAnalysis {
  ok: boolean
  nodes: Record<string, NodeAnalysis>
  edges: Record<string, number>
  summary: {
    /** Fixed/unlimited sources plus demand on unconnected inputs. */
    inputs: ItemRate[]
    /** Production on unconnected recipe outputs. */
    products: ItemRate[]
    surplus: ItemRate[]
    shortage: ItemRate[]
    machines: { machine: BuiltMachineId; count: number }[]
    stress: number
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

export function analyze(plan: Plan, catalog: Catalog): PlanAnalysis {
  const solved = solve(plan, catalog)
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
    const machines = machineCount(
      result.runsPerMinute,
      recipe ? machine.runsPerMinute(recipe, conditions) : 0,
    )
    const stress =
      machines.count * machine.stressImpact * Math.abs(conditions.rpm)
    nodes[node.id] = { solved: result, machines, stress, conditions }
    build(node.machineId, machines.count, stress)
  }

  return {
    ok: solved.ok,
    nodes,
    edges: solved.edges,
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
    },
  }
}
