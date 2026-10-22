import type { Catalog } from '../catalog'
import type { PlanNode } from './plan'

export interface Port {
  item: string
  /** Expected amount per recipe execution (count × chance, summed per item). */
  perRun: number
  /** Set when the port is a single chance output, for display. */
  chance?: number
}

export interface NodePorts {
  inputs: Port[]
  outputs: Port[]
}

export function portsOf(node: PlanNode, catalog: Catalog): NodePorts {
  if (node.kind === 'source')
    return { inputs: [], outputs: [{ item: node.item, perRun: 1 }] }

  const recipe = catalog.recipe(node.recipeId)
  if (!recipe) return { inputs: [], outputs: [] }

  const outputs = new Map<string, Port>()
  for (const { item, amount, chance } of recipe.outputs) {
    const existing = outputs.get(item)
    if (existing) {
      existing.perRun += amount * chance
      delete existing.chance
    } else {
      outputs.set(item, {
        item,
        perRun: amount * chance,
        ...(chance < 1 && { chance }),
      })
    }
  }
  return {
    inputs: recipe.inputs.map(({ item, amount }) => ({ item, perRun: amount })),
    outputs: [...outputs.values()],
  }
}
