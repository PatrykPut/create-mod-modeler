// Renders block item models (JSON elements or OBJ) into isometric icons, the way the inventory
// shows them: the model's `display.gui` transform, flat face shading and a depth buffer.

export type Vec3 = [number, number, number]
type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down'

interface Face {
  uv?: [number, number, number, number]
  texture: string
  rotation?: number
}

interface Element {
  from: Vec3
  to: Vec3
  rotation?: {
    origin: Vec3
    axis: 'x' | 'y' | 'z'
    angle: number
    rescale?: boolean
  }
  faces?: Partial<Record<Direction, Face>>
  shade?: boolean
}

interface Transform {
  rotation?: Vec3
  translation?: Vec3
  scale?: Vec3
}

export interface Model {
  parent?: string
  textures?: Record<string, string>
  elements?: Element[]
  display?: { gui?: Transform }
  /** NeoForge OBJ models: `loader: "neoforge:obj"` plus the .obj path. */
  loader?: string
  model?: string
  flip_v?: boolean
}

/** A flat, textured polygon in model space (pixels, a block spans 0..16). */
export interface Polygon {
  points: Vec3[]
  /** Texture coordinates (0..1 of the texture's first frame), one per point. */
  uvs: [number, number][]
  /** Texture id, e.g. "create:block/axis". */
  texture: string
  /** Outward normal in model space. */
  normal: Vec3
  shade: boolean
}

export interface Texture {
  width: number
  height: number
  /** RGBA, row by row. */
  data: Uint8ClampedArray | number[]
}

const MAX_PARENTS = 16
// vanilla block/block.json, for models that inherit no gui transform
const DEFAULT_GUI: Transform = {
  rotation: [30, 225, 0],
  scale: [0.625, 0.625, 0.625],
}

const withNamespace = (id: string) =>
  id.includes(':') ? id : `minecraft:${id}`

const DEG = Math.PI / 180

function rotate([x, y, z]: Vec3, axis: 'x' | 'y' | 'z', degrees: number): Vec3 {
  const c = Math.cos(degrees * DEG)
  const s = Math.sin(degrees * DEG)
  if (axis === 'x') return [x, y * c - z * s, y * s + z * c]
  if (axis === 'y') return [x * c + z * s, y, -x * s + z * c]
  return [x * c - y * s, x * s + y * c, z]
}

const NORMALS: Record<Direction, Vec3> = {
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
}

/**
 * Face corners in uv order: top-left, top-right, bottom-right, bottom-left
 * (FaceBakery / BlockModel conventions, as Blockbench shows them).
 */
function corners(
  dir: Direction,
  [x1, y1, z1]: Vec3,
  [x2, y2, z2]: Vec3,
): Vec3[] {
  switch (dir) {
    case 'north':
      return [
        [x2, y2, z1],
        [x1, y2, z1],
        [x1, y1, z1],
        [x2, y1, z1],
      ]
    case 'south':
      return [
        [x1, y2, z2],
        [x2, y2, z2],
        [x2, y1, z2],
        [x1, y1, z2],
      ]
    case 'east':
      return [
        [x2, y2, z2],
        [x2, y2, z1],
        [x2, y1, z1],
        [x2, y1, z2],
      ]
    case 'west':
      return [
        [x1, y2, z1],
        [x1, y2, z2],
        [x1, y1, z2],
        [x1, y1, z1],
      ]
    case 'up':
      return [
        [x1, y2, z1],
        [x2, y2, z1],
        [x2, y2, z2],
        [x1, y2, z2],
      ]
    case 'down':
      return [
        [x1, y1, z2],
        [x2, y1, z2],
        [x2, y1, z1],
        [x1, y1, z1],
      ]
  }
}

/** UVs Minecraft derives from the element's position when a face has none. */
function defaultUv(dir: Direction, [x1, y1, z1]: Vec3, [x2, y2, z2]: Vec3) {
  switch (dir) {
    case 'north':
      return [16 - x2, 16 - y2, 16 - x1, 16 - y1]
    case 'south':
      return [x1, 16 - y2, x2, 16 - y1]
    case 'east':
      return [16 - z2, 16 - y2, 16 - z1, 16 - y1]
    case 'west':
      return [z1, 16 - y2, z2, 16 - y1]
    case 'up':
      return [x1, z1, x2, z2]
    case 'down':
      return [x1, 16 - z2, x2, 16 - z1]
  }
}

export interface ResolvedModel {
  textures: Record<string, string>
  gui: Transform
  elements?: Element[]
  obj?: { model: string; flipV: boolean }
}

/** Follows the parents of an item model; undefined for flat (item/generated) models. */
export function resolveModel(
  item: string,
  readModel: (id: string) => Model | undefined,
): ResolvedModel | undefined {
  const [namespace, path] = item.split(':')
  const textures: Record<string, string> = {}
  let gui: Transform | undefined
  let elements: Element[] | undefined
  let obj: ResolvedModel['obj']
  let id: string | undefined = `${namespace}:item/${path}`
  for (let depth = 0; id && depth < MAX_PARENTS; depth++) {
    const model = readModel(withNamespace(id))
    if (!model) break
    // child values override their parents'
    for (const [key, value] of Object.entries(model.textures ?? {}))
      textures[key] ??= value
    gui ??= model.display?.gui
    if (!elements && !obj) {
      if (model.elements) elements = model.elements
      else if (model.loader === 'neoforge:obj' && model.model)
        obj = { model: model.model, flipV: model.flip_v ?? false }
    }
    id = model.parent
  }
  if (!elements && !obj) return undefined
  return { textures, gui: gui ?? DEFAULT_GUI, elements, obj }
}

/** Resolves "#side" references to a texture id such as "minecraft:block/stone". */
function textureId(
  textures: Record<string, string>,
  ref: string,
): string | undefined {
  let value: string | undefined = ref
  for (let i = 0; value?.startsWith('#') && i < MAX_PARENTS; i++)
    value = textures[value.slice(1)]
  return value && !value.startsWith('#') ? withNamespace(value) : undefined
}

export function elementPolygons(
  elements: Element[],
  textures: Record<string, string>,
): Polygon[] {
  const polygons: Polygon[] = []
  for (const element of elements) {
    const { rotation } = element
    const place = (point: Vec3): Vec3 => {
      if (!rotation) return point
      const { origin, axis, angle } = rotation
      const local: Vec3 = [
        point[0] - origin[0],
        point[1] - origin[1],
        point[2] - origin[2],
      ]
      let [x, y, z] = rotate(local, axis, angle)
      if (rotation.rescale) {
        // stretches the faces back to the block's width (BlockElementRotation)
        const k = 1 / Math.cos(Math.abs(angle) * DEG)
        if (axis !== 'x') x *= k
        if (axis !== 'y') y *= k
        if (axis !== 'z') z *= k
      }
      return [x + origin[0], y + origin[1], z + origin[2]]
    }
    for (const [dir, face] of Object.entries(element.faces ?? {}) as [
      Direction,
      Face,
    ][]) {
      const texture = textureId(textures, face.texture)
      if (!texture) continue
      const [u1, v1, u2, v2] =
        face.uv ?? defaultUv(dir, element.from, element.to)
      const uvCorners: [number, number][] = [
        [u1 / 16, v1 / 16],
        [u2 / 16, v1 / 16],
        [u2 / 16, v2 / 16],
        [u1 / 16, v2 / 16],
      ]
      // face rotation turns the texture clockwise on the face
      const turns = (((face.rotation ?? 0) / 90) % 4) + 4
      polygons.push({
        points: corners(dir, element.from, element.to).map(place),
        uvs: uvCorners.map((_, i) => uvCorners[(i - turns + 8) % 4]),
        texture,
        normal: rotation
          ? rotate(NORMALS[dir], rotation.axis, rotation.angle)
          : NORMALS[dir],
        shade: element.shade ?? true,
      })
    }
  }
  return polygons
}

/**
 * Wavefront OBJ (as the NeoForge loader reads it): positions in blocks, materials whose
 * `map_Kd` names a texture variable such as "#planks".
 */
export function objPolygons(
  obj: string,
  mtl: string,
  textures: Record<string, string>,
  flipV: boolean,
): Polygon[] {
  const materials: Record<string, string> = {}
  let material: string | undefined
  for (const line of mtl.split('\n')) {
    const [key, value] = line.trim().split(/\s+/)
    if (key === 'newmtl') material = value
    else if (key === 'map_Kd' && material) materials[material] = value
  }
  const positions: Vec3[] = []
  const uvs: [number, number][] = []
  const normals: Vec3[] = []
  const polygons: Polygon[] = []
  let texture: string | undefined
  for (const line of obj.split('\n')) {
    const [key, ...args] = line.trim().split(/\s+/)
    const numbers = args.map(Number)
    if (key === 'v')
      positions.push([numbers[0] * 16, numbers[1] * 16, numbers[2] * 16])
    else if (key === 'vt')
      uvs.push([numbers[0], flipV ? 1 - numbers[1] : numbers[1]])
    else if (key === 'vn') normals.push([numbers[0], numbers[1], numbers[2]])
    else if (key === 'usemtl')
      texture = materials[args[0]] && textureId(textures, materials[args[0]])
    else if (key === 'f' && texture) {
      const refs = args.map((ref) => ref.split('/').map(Number))
      const points = refs.map(([v]) => positions[v - 1])
      const normal =
        refs[0][2] !== undefined ? normals[refs[0][2] - 1] : faceNormal(points)
      polygons.push({
        points,
        uvs: refs.map(([, vt]) => uvs[vt - 1] ?? [0, 0]),
        texture,
        normal,
        shade: true,
      })
    }
  }
  return polygons
}

function faceNormal([a, b, c]: Vec3[]): Vec3 {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const n: Vec3 = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ]
  const length = Math.hypot(...n) || 1
  return [n[0] / length, n[1] / length, n[2] / length]
}

// The two diffuse lights of Lighting.setupFor3DItems (DIFFUSE_LIGHT_0/1 turned by the matrix
// of RenderSystem.setupGui3DDiffuseLighting), in view space with y up.
const GUI_LIGHTS: Vec3[] = [
  [-0.933, 0.263, -0.244],
  [-0.104, 0.977, 0.188],
]

/** Shader lighting (minecraft_mix_light): 0.4 ambient plus 0.6 per light. */
function brightness(viewNormal: Vec3, shade: boolean) {
  if (!shade) return 1
  let diffuse = 0
  for (const light of GUI_LIGHTS)
    diffuse += Math.max(
      0,
      light[0] * viewNormal[0] +
        light[1] * viewNormal[1] +
        light[2] * viewNormal[2],
    )
  return Math.min(1, 0.4 + 0.6 * diffuse)
}

/** Applies the gui transform (ItemTransform: translate, rotate X·Y·Z, scale). */
function guiTransform({
  rotation = [0, 0, 0],
  translation = [0, 0, 0],
  scale = [1, 1, 1],
}: Transform) {
  const turn = (v: Vec3) =>
    rotate(
      rotate(rotate(v, 'z', rotation[2]), 'y', rotation[1]),
      'x',
      rotation[0],
    )
  return {
    point: ([x, y, z]: Vec3): Vec3 => {
      // block units, centred on the block
      const [rx, ry, rz] = turn([
        (x / 16 - 0.5) * scale[0],
        (y / 16 - 0.5) * scale[1],
        (z / 16 - 0.5) * scale[2],
      ])
      return [
        rx + translation[0] / 16,
        ry + translation[1] / 16,
        rz + translation[2] / 16,
      ]
    },
    normal: turn,
  }
}

const ALPHA_CUTOFF = 128

/**
 * Draws the polygons into a square RGBA image of `size` pixels, sampled `supersample`
 * times per axis. The gui view looks along -z; the icon spans -0.5..0.5 on x and y.
 */
export function rasterize(
  polygons: Polygon[],
  gui: Transform,
  textures: Map<string, Texture>,
  size: number,
  supersample = 4,
): Uint8ClampedArray {
  const full = size * supersample
  const color = new Float32Array(full * full * 4)
  const depth = new Float32Array(full * full).fill(-Infinity)
  const transform = guiTransform(gui)

  for (const polygon of polygons) {
    const texture = textures.get(polygon.texture)
    if (!texture) continue
    const viewNormal = transform.normal(polygon.normal)
    // the view only sees faces turned towards it
    if (viewNormal[2] <= 0) continue
    const light = brightness(viewNormal, polygon.shade)
    const frameHeight =
      texture.height > texture.width && texture.height % texture.width === 0
        ? texture.width
        : texture.height
    const screen = polygon.points.map((p) => {
      const [x, y, z] = transform.point(p)
      return [(x + 0.5) * full, (0.5 - y) * full, z]
    })
    // texel bounds of the face, so neighbouring texels never bleed in
    const us = polygon.uvs.map(([u]) => u * texture.width)
    const vs = polygon.uvs.map(([, v]) => v * frameHeight)
    const minU = Math.max(0, Math.floor(Math.min(...us) + 1e-4))
    const maxU = Math.min(texture.width, Math.ceil(Math.max(...us) - 1e-4)) - 1
    const minV = Math.max(0, Math.floor(Math.min(...vs) + 1e-4))
    const maxV = Math.min(frameHeight, Math.ceil(Math.max(...vs) - 1e-4)) - 1

    // fan triangulation; faces are convex
    for (let i = 1; i + 1 < screen.length; i++) {
      const [a, b, c] = [0, i, i + 1]
      const [ax, ay, az] = screen[a]
      const [bx, by, bz] = screen[b]
      const [cx, cy, cz] = screen[c]
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
      if (Math.abs(area) < 1e-9) continue
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)))
      const x1 = Math.min(full - 1, Math.ceil(Math.max(ax, bx, cx)))
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)))
      const y1 = Math.min(full - 1, Math.ceil(Math.max(ay, by, cy)))
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const sx = px + 0.5
          const sy = py + 0.5
          // barycentric weights; the sign of `area` handles both windings
          const wa = ((bx - sx) * (cy - sy) - (by - sy) * (cx - sx)) / area
          const wb = ((cx - sx) * (ay - sy) - (cy - sy) * (ax - sx)) / area
          const wc = 1 - wa - wb
          if (wa < 0 || wb < 0 || wc < 0) continue
          const z = wa * az + wb * bz + wc * cz
          const pixel = py * full + px
          if (z <= depth[pixel]) continue
          const u = wa * us[a] + wb * us[b] + wc * us[c]
          const v = wa * vs[a] + wb * vs[b] + wc * vs[c]
          const tx = Math.min(maxU, Math.max(minU, Math.floor(u)))
          const ty = Math.min(maxV, Math.max(minV, Math.floor(v)))
          const t = (ty * texture.width + tx) * 4
          if (texture.data[t + 3] < ALPHA_CUTOFF) continue
          depth[pixel] = z
          color[pixel * 4] = texture.data[t] * light
          color[pixel * 4 + 1] = texture.data[t + 1] * light
          color[pixel * 4 + 2] = texture.data[t + 2] * light
          color[pixel * 4 + 3] = 255
        }
      }
    }
  }

  // average each supersample block (colours weighted by coverage)
  const out = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let dy = 0; dy < supersample; dy++) {
        for (let dx = 0; dx < supersample; dx++) {
          const i = ((y * supersample + dy) * full + x * supersample + dx) * 4
          r += color[i]
          g += color[i + 1]
          b += color[i + 2]
          a += color[i + 3]
        }
      }
      const o = (y * size + x) * 4
      const covered = a / 255
      if (covered === 0) continue
      out[o] = r / covered
      out[o + 1] = g / covered
      out[o + 2] = b / covered
      out[o + 3] = a / (supersample * supersample)
    }
  }
  return out
}
