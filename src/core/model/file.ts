// Plans as files (JSON export/import) and as share links (compressed into the URL).
import { removeInvalidSources } from '../sources'
import type { TimeUnit } from '../units'
import { readAddons, toBase64 } from './addons'
import {
  MAX_STACK_SIZE,
  SCHEMA_VERSION,
  type Plan,
  type PlanEdge,
  type PlanNode,
  type Settings,
} from './plan'

export const FILE_FORMAT = 'create-mod-modeler/plan'
const DEFAULT_NAME = 'Imported plan'

export interface PlanFile {
  format: typeof FILE_FORMAT
  name: string
  plan: Plan
}

export class PlanFileError extends Error {}

export const toPlanFile = (name: string, plan: Plan): PlanFile => ({
  format: FILE_FORMAT,
  name,
  plan,
})

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isPosition = (value: unknown) =>
  isObject(value) && typeof value.x === 'number' && typeof value.y === 'number'
const TIME_UNITS: TimeUnit[] = ['second', 'minute', 'hour']
const NODE_FIELDS: Record<PlanNode['kind'], string[]> = {
  recipe: ['recipeId', 'machineId'],
  source: ['item'],
  power: ['source'],
}

function checkNode(value: unknown, index: number): PlanNode {
  const fail = (why: string) => {
    throw new PlanFileError(`The plan's node ${index + 1} ${why}.`)
  }
  if (!isObject(value) || typeof value.id !== 'string') fail('has no id')
  const node = value as Json
  const fields = NODE_FIELDS[node.kind as PlanNode['kind']]
  if (!fields) fail(`has an unknown kind "${String(node.kind)}"`)
  for (const field of fields)
    if (typeof node[field] !== 'string') fail(`has no ${field}`)
  if (!isPosition(node.position)) fail('has no position')
  return node as unknown as PlanNode
}

function checkPlan(value: unknown): Plan {
  if (
    !isObject(value) ||
    !isObject(value.settings) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges)
  )
    throw new PlanFileError('This is not a Create Mod Modeler plan.')
  if (typeof value.schemaVersion !== 'number')
    throw new PlanFileError('The plan has no schema version.')
  if (value.schemaVersion > SCHEMA_VERSION)
    throw new PlanFileError(
      'The plan was made with a newer version of the modeler.',
    )
  const { rpm, timeUnit, stackSize } = value.settings
  if (typeof rpm !== 'number' || !TIME_UNITS.includes(timeUnit as TimeUnit))
    throw new PlanFileError('The plan has invalid settings.')
  const settings: Settings = { rpm, timeUnit: timeUnit as TimeUnit }
  // optional, so files from before it existed stay valid
  if (
    typeof stackSize === 'number' &&
    stackSize >= 1 &&
    stackSize <= MAX_STACK_SIZE
  )
    settings.stackSize = stackSize

  const nodes = value.nodes.map(checkNode)
  const ids = new Set(nodes.map((n) => n.id))
  // an edge is only kept when both of its nodes are in the plan
  const edges = value.edges.filter(
    (edge): edge is PlanEdge =>
      isObject(edge) &&
      typeof edge.id === 'string' &&
      typeof edge.item === 'string' &&
      ids.has(edge.source as string) &&
      ids.has(edge.target as string),
  )
  const addons = readAddons(value.addons)
  return {
    schemaVersion: SCHEMA_VERSION,
    settings,
    nodes,
    edges,
    ...(addons && { addons }),
  }
}

export interface ReadPlan {
  name: string
  plan: Plan
  /** Items of source nodes that were dropped (see core/sources.ts). */
  removed: string[]
}

function fromJson(value: unknown): ReadPlan {
  const file = isObject(value) && value.format === FILE_FORMAT
  const name =
    file && typeof value.name === 'string' && value.name.trim()
      ? value.name
      : DEFAULT_NAME
  return { name, ...removeInvalidSources(checkPlan(file ? value.plan : value)) }
}

/** Reads an exported plan file (or a bare plan). Throws PlanFileError. */
export function parsePlanFile(text: string): ReadPlan {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new PlanFileError('The file is not valid JSON.')
  }
  return fromJson(value)
}

async function pipe(bytes: Uint8Array, stream: GenericTransformStream) {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(output).arrayBuffer())
}

const toBase64Url = (bytes: Uint8Array) =>
  toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromBase64Url = (code: string) =>
  Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0),
  )

/** A URL-safe code for the plan: deflated JSON in base64url, without addon icons. */
export async function encodeShare(name: string, plan: Plan): Promise<string> {
  let shared = plan
  if (plan.addons?.icons) {
    const { icons: _icons, ...addons } = plan.addons
    shared = { ...plan, addons }
  }
  const json = new TextEncoder().encode(
    JSON.stringify(toPlanFile(name, shared)),
  )
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
}

export async function decodeShare(code: string): Promise<ReadPlan> {
  let text: string
  try {
    const bytes = await pipe(
      fromBase64Url(code),
      new DecompressionStream('deflate-raw'),
    )
    text = new TextDecoder().decode(bytes)
  } catch {
    throw new PlanFileError('The share link is broken or incomplete.')
  }
  return parsePlanFile(text)
}
