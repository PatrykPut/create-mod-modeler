// Recipes Create generates at load time instead of shipping them as JSON.
// Source: foundation/data/RuntimeDataGenerator.java (cuttingRecipes, washingRecipes).
import type { Recipe } from '../../data/types.ts'

// same patterns as RuntimeDataGenerator
const STRIPPED_WOODS_PREFIX =
  /(\w*)??stripped_(\w*)(_log|_wood|_stem|_hyphae|_block|(?<!_)wood)()$/
const STRIPPED_WOOD_SUFFIX =
  /(\w*)(_log|_wood|_stem|_hyphae|_block|(?<!_)wood)(\w*)_stripped(\w*)/
const NON_STRIPPED_WOODS =
  /^(?!stripped_)([a-z_]+)(_log|_wood|_stem|_hyphae|(?<!bioshroom)_block)(([a-z_]+)(?<!_stripped))?$/

const WOOD_CUTTING_TIME = 50
const PLANK_PRODUCTS: [suffix: string, count: number][] = [
  ['_stairs', 1],
  ['_slab', 2],
  ['_fence', 1],
  ['_fence_gate', 1],
  ['_door', 1],
  ['_trapdoor', 1],
  ['_pressure_plate', 1],
  ['_button', 1],
  ['_sign', 1],
]

/** @param items every item id in the game (vanilla and Create) */
export function runtimeRecipes(items: ReadonlySet<string>): Recipe[] {
  const recipes = new Map<string, Recipe>()

  function add(
    type: 'cutting' | 'splashing',
    input: string,
    output: string,
    amount = 1,
  ) {
    if (!items.has(output)) return
    const [namespace, from] = input.split(':')
    const id = `create:runtime_generated/compat/${namespace}/${from}_to_${output.split(':')[1]}`
    recipes.set(id, {
      id,
      type,
      inputs: [{ item: input, amount: 1 }],
      outputs: [{ item: output, amount, chance: 1 }],
      ...(type === 'cutting' && { processingTime: WOOD_CUTTING_TIME }),
      derivedFrom: 'runtime',
    })
  }

  for (const item of [...items].sort()) {
    const [namespace, path] = item.split(':')
    const id = (p: string) => `${namespace}:${p}`

    let match = STRIPPED_WOODS_PREFIX.exec(path)
    const strippedInPrefix = match !== null
    if (!match) match = STRIPPED_WOOD_SUFFIX.exec(path)
    let noStrippedVariant = false
    if (
      !match &&
      !items.has(id(`stripped_${path}`)) &&
      !items.has(id(`${path}_stripped`))
    ) {
      match = NON_STRIPPED_WOODS.exec(path)
      noStrippedVariant = true
    }

    if (match) {
      const prefix = strippedInPrefix ? (match[1] ?? '') : ''
      const suffix =
        !strippedInPrefix && !noStrippedVariant
          ? `${match[3] ?? ''}${match[4] ?? ''}`
          : ''
      const type = match[strippedInPrefix ? 3 : 2]
      const name = match[strippedInPrefix ? 2 : 1]
      const base = name + (type === 'wood' ? 'wood' : '')
      const nonStripped = id(prefix + name + type + suffix)
      const planks = id(`${base}_planks`)
      const planksCount = type.includes('block') ? 3 : 6

      if (!noStrippedVariant) {
        if (items.has(nonStripped)) add('cutting', nonStripped, item)
        add('cutting', item, planks, planksCount)
      } else if (items.has(planks)) {
        // Create puts such logs in a generated tag; one recipe per item is equivalent here
        add('cutting', item, planks, planksCount)
      }

      if (
        !path.includes('_wood') &&
        !path.includes('_hyphae') &&
        items.has(planks)
      )
        for (const [productSuffix, count] of PLANK_PRODUCTS)
          add('cutting', planks, id(base + productSuffix), count)
    }

    // ConcretePowderBlock → its concrete
    if (path.endsWith('_concrete_powder'))
      add('splashing', item, id(path.replace(/_powder$/, '')))
  }
  return [...recipes.values()]
}
