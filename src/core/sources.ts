// What a source node may supply: items Create automates renewably (DESIGN §3).
// Anything else a recipe needs stays an open input of the plan.
import type { MachineBlock } from './blocks'
import { GENERATED_BLOCKS } from './machines'
import type { Plan } from './model/plan'

export type SourceKind = 'generator' | 'tree' | 'crop' | 'fluid'

export const SOURCE_KINDS: Record<
  SourceKind,
  { name: string; note: string; /** Shown as the icon. */ block: MachineBlock }
> = {
  generator: {
    name: 'Generator',
    block: 'create:mechanical_drill',
    note: 'Mined by Mechanical Drills on a block generator.',
  },
  tree: {
    name: 'Tree farm',
    block: 'create:mechanical_saw',
    note: 'Trees felled by Mechanical Saws or Drills; leaves drop saplings, sticks and apples.',
  },
  crop: {
    name: 'Crop farm',
    block: 'create:mechanical_harvester',
    note: 'Harvested by Mechanical Harvesters, Ploughs, Saws or Drills.',
  },
  fluid: {
    name: 'Pump',
    block: 'create:mechanical_pump',
    note: 'Pumped from a bottomless source (tag create:bottomless/allow).',
  },
}

const WOODS = [
  'oak',
  'spruce',
  'birch',
  'jungle',
  'acacia',
  'dark_oak',
  'cherry',
]

const BY_KIND: Record<SourceKind, string[]> = {
  generator: Object.keys(GENERATED_BLOCKS),
  tree: [
    ...WOODS.map((wood) => `minecraft:${wood}_log`),
    'minecraft:mangrove_log',
    'minecraft:crimson_stem',
    'minecraft:warped_stem',
    ...WOODS.map((wood) => `minecraft:${wood}_sapling`),
    'minecraft:mangrove_propagule',
    'minecraft:stick',
    'minecraft:apple',
  ],
  crop: [
    'minecraft:wheat',
    'minecraft:wheat_seeds',
    'minecraft:carrot',
    'minecraft:potato',
    'minecraft:poisonous_potato',
    'minecraft:beetroot',
    'minecraft:beetroot_seeds',
    'minecraft:sugar_cane',
    'minecraft:bamboo',
    'minecraft:kelp',
    'minecraft:cactus',
    'minecraft:melon_slice',
    'minecraft:pumpkin',
    'minecraft:sweet_berries',
    'minecraft:glow_berries',
    'minecraft:cocoa_beans',
    'minecraft:nether_wart',
  ],
  fluid: ['fluid:minecraft:water', 'fluid:minecraft:lava'],
}

export const SOURCES: { item: string; kind: SourceKind }[] = Object.entries(
  BY_KIND,
).flatMap(([kind, items]) =>
  items.map((item) => ({ item, kind: kind as SourceKind })),
)

const KIND_OF = new Map(SOURCES.map((s) => [s.item, s.kind]))

export const sourceKind = (item: string): SourceKind | undefined =>
  KIND_OF.get(item)

/** Drops source nodes no farm or generator could be, with their edges. */
export function removeInvalidSources(plan: Plan): {
  plan: Plan
  removed: string[]
} {
  const invalid = plan.nodes.filter(
    (n) => n.kind === 'source' && !sourceKind(n.item),
  )
  if (invalid.length === 0) return { plan, removed: [] }
  const ids = new Set(invalid.map((n) => n.id))
  return {
    plan: {
      ...plan,
      nodes: plan.nodes.filter((n) => !ids.has(n.id)),
      edges: plan.edges.filter((e) => !ids.has(e.source)),
    },
    removed: [
      ...new Set(invalid.map((n) => (n.kind === 'source' ? n.item : ''))),
    ],
  }
}
