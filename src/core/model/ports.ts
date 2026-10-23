import type { Catalog } from '../catalog'
import { burnerFuels, DEFAULT_FUEL, fuelFor, type Fuel } from '../fuels'
import { MACHINES } from '../machines'
import type { RecipeNode, PlanNode } from './plan'

export interface Port {
  item: string
  /** Expected amount per recipe execution (count × chance, summed per item). */
  perRun: number
  /** Amount per minute that does not depend on the runs (Blaze Burner fuel). */
  fixed?: number
  /** Set when the port is a single chance output, for display. */
  chance?: number
  /** Fuel port of a heated basin or furnace. */
  fuel?: boolean
}

export interface NodePorts {
  inputs: Port[]
  outputs: Port[]
}

export interface PortOptions {
  /** Blaze Burners per recipe node; they burn fuel all the time, even while idle. */
  burners?: Record<string, number>
}

const TICKS_PER_MINUTE = 1200

/** The fuel a node burns, or undefined when it needs none. */
export function fuelOf(
  node: RecipeNode,
  catalog: Catalog,
): { fuel: Fuel; burner: boolean } | undefined {
  const recipe = catalog.recipe(node.recipeId)
  const machine = MACHINES[node.machineId]
  if (!recipe) return undefined
  if (machine.fuelTicksPerRun) {
    const fuel =
      fuelFor(node.fuel ?? DEFAULT_FUEL.furnace, true) ??
      fuelFor(DEFAULT_FUEL.furnace, true)!
    return { fuel, burner: false }
  }
  if (machine.basin && recipe.heat) {
    const allowed = burnerFuels(recipe.heat)
    const fuel =
      allowed.find((f) => f.item === node.fuel) ??
      allowed.find((f) => f.item === DEFAULT_FUEL[recipe.heat!])!
    return { fuel, burner: true }
  }
  return undefined
}

function add(ports: Map<string, Port>, port: Port) {
  const existing = ports.get(port.item)
  if (!existing) {
    ports.set(port.item, { ...port })
    return
  }
  existing.perRun += port.perRun
  if (port.fixed) existing.fixed = (existing.fixed ?? 0) + port.fixed
  if (port.fuel) existing.fuel = true
  delete existing.chance
}

export function portsOf(
  node: PlanNode,
  catalog: Catalog,
  options: PortOptions = {},
): NodePorts {
  if (node.kind === 'power') return { inputs: [], outputs: [] }
  if (node.kind === 'source')
    return { inputs: [], outputs: [{ item: node.item, perRun: 1 }] }

  const recipe = catalog.recipe(node.recipeId)
  if (!recipe) return { inputs: [], outputs: [] }

  const inputs = new Map<string, Port>()
  const outputs = new Map<string, Port>()
  for (const { item, amount } of recipe.inputs)
    add(inputs, { item, perRun: amount })
  for (const { item, amount, chance } of recipe.outputs)
    add(outputs, {
      item,
      perRun: amount * chance,
      ...(chance < 1 && { chance }),
    })

  const burning = fuelOf(node, catalog)
  if (burning) {
    const { fuel, burner } = burning
    const usage: Port = burner
      ? {
          item: fuel.item,
          perRun: 0,
          fixed:
            ((options.burners?.[node.id] ?? 0) * TICKS_PER_MINUTE) /
            fuel.burnTime,
        }
      : {
          item: fuel.item,
          perRun:
            MACHINES[node.machineId].fuelTicksPerRun!(recipe) / fuel.burnTime,
        }
    add(inputs, { ...usage, fuel: true })
    if (fuel.remainder) add(outputs, { ...usage, item: fuel.remainder })
  }

  return { inputs: [...inputs.values()], outputs: [...outputs.values()] }
}
