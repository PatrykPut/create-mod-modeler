// Everything the UI shows about a plan: solved rates plus machine counts, stress and totals.
import type { Catalog } from './catalog'
import { MACHINES, type MachineId, type MachineConditions } from './machines'
import type { Plan, RecipeNode } from './model/plan'
import { solve, type NodeResult } from './solver/solve'

const EPSILON = 1e-9

export const DEFAULT_STACK_SIZE = 1
export const DEFAULT_PARALLEL_STACKS = 1

export interface NodeAnalysis {
  solved: NodeResult
  /** Recipe nodes only; sources have count 0. */
  machines: { exact: number; count: number; utilization: number }
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
    machines: { machine: MachineId; count: number }[]
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
  const machineCounts = new Map<MachineId, number>()
  let totalStress = 0

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
      nodes[node.id] = {
        solved: result,
        machines: { exact: 0, count: 0, utilization: 0 },
        stress: 0,
      }
      continue
    }

    const machine = MACHINES[node.machineId]
    const recipe = catalog.recipe(node.recipeId)
    const conditions = conditionsOf(node, plan)
    const capacity = recipe ? machine.runsPerMinute(recipe, conditions) : 0
    const exact =
      capacity > 0 && Number.isFinite(capacity)
        ? result.runsPerMinute / capacity
        : 0
    const count = Math.ceil(exact - EPSILON)
    const stress = count * machine.stressImpact * Math.abs(conditions.rpm)
    nodes[node.id] = {
      solved: result,
      machines: { exact, count, utilization: count ? exact / count : 0 },
      stress,
      conditions,
    }
    totalStress += stress
    if (count)
      machineCounts.set(
        node.machineId,
        (machineCounts.get(node.machineId) ?? 0) + count,
      )
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
