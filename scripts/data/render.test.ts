import { describe, expect, it } from 'vitest'
import {
  elementPolygons,
  objPolygons,
  rasterize,
  resolveModel,
  type Model,
  type Texture,
} from './render.ts'

const models: Record<string, Model> = {
  'create:item/press': { parent: 'create:block/press/item' },
  'create:block/press/item': {
    parent: 'block/block',
    textures: { side: 'create:block/press_side', top: '#side' },
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: { up: { texture: '#top' } },
      },
    ],
  },
  'minecraft:block/block': {
    textures: { side: 'minecraft:block/stone' },
    display: { gui: { rotation: [30, 225, 0], scale: [0.625, 0.625, 0.625] } },
  },
  'create:item/wheel': {
    parent: 'create:block/wheel/textures',
    loader: 'neoforge:obj',
    model: 'create:models/block/wheel.obj',
    flip_v: true,
  },
  'create:block/wheel/textures': { textures: { planks: 'block/oak_planks' } },
  'minecraft:item/stick': {
    parent: 'minecraft:item/generated',
    textures: { layer0: 'minecraft:item/stick' },
  },
  'minecraft:item/generated': {},
}
const read = (id: string) => models[id]

describe('resolveModel', () => {
  it('follows parents; child textures win, the gui transform is inherited', () => {
    expect(resolveModel('create:press', read)).toEqual({
      textures: { side: 'create:block/press_side', top: '#side' },
      gui: { rotation: [30, 225, 0], scale: [0.625, 0.625, 0.625] },
      elements: models['create:block/press/item'].elements,
      obj: undefined,
    })
  })

  it('finds OBJ models and skips flat item models', () => {
    expect(resolveModel('create:wheel', read)?.obj).toEqual({
      model: 'create:models/block/wheel.obj',
      flipV: true,
    })
    expect(resolveModel('minecraft:stick', read)).toBeUndefined()
  })
})

describe('elementPolygons', () => {
  const textures = { side: 'create:block/side' }
  const cube = (face: {
    texture: string
    uv?: [number, number, number, number]
    rotation?: number
  }) =>
    elementPolygons(
      [{ from: [0, 0, 0], to: [16, 8, 16], faces: { up: face } }],
      textures,
    )[0]

  it('places faces and derives missing UVs from the element', () => {
    const up = cube({ texture: '#side' })
    expect(up.texture).toBe('create:block/side')
    expect(up.points).toEqual([
      [0, 8, 0],
      [16, 8, 0],
      [16, 8, 16],
      [0, 8, 16],
    ])
    expect(up.uvs).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ])
    expect(up.normal).toEqual([0, 1, 0])
  })

  it('turns the texture clockwise by the face rotation', () => {
    const up = cube({ texture: '#side', uv: [0, 0, 8, 8], rotation: 90 })
    // the texture's top-left corner moves to the face's top-right corner
    expect(up.uvs).toEqual([
      [0, 0.5],
      [0, 0],
      [0.5, 0],
      [0.5, 0.5],
    ])
  })

  it('skips faces whose texture is not defined', () => {
    expect(cube({ texture: '#missing' })).toBeUndefined()
  })
})

describe('objPolygons', () => {
  it('reads faces with the texture of their material, in pixels', () => {
    const obj = [
      'mtllib wheel.mtl',
      'v 0 0 0',
      'v 1 0 0',
      'v 1 1 0',
      'vt 0 0',
      'vt 1 0',
      'vt 1 1',
      'vn 0 0 -1',
      'usemtl wood',
      'f 1/1/1 2/2/1 3/3/1',
    ].join('\n')
    const mtl = 'newmtl wood\nmap_Kd #planks\n'
    const [triangle] = objPolygons(
      obj,
      mtl,
      { planks: 'block/oak_planks' },
      true,
    )
    expect(triangle).toEqual({
      points: [
        [0, 0, 0],
        [16, 0, 0],
        [16, 16, 0],
      ],
      uvs: [
        [0, 1],
        [1, 1],
        [1, 0],
      ],
      texture: 'minecraft:block/oak_planks',
      normal: [0, 0, -1],
      shade: true,
    })
  })
})

describe('rasterize', () => {
  const DIRECTIONS = ['north', 'south', 'east', 'west', 'up', 'down']
  // one colour per face, so each pixel tells which face it shows
  const COLORS: Record<string, [number, number, number]> = {
    north: [0, 200, 0],
    south: [200, 200, 0],
    east: [0, 0, 200],
    west: [200, 0, 200],
    up: [200, 0, 0],
    down: [0, 200, 200],
  }
  const textures = new Map<string, Texture>(
    DIRECTIONS.map((d) => [
      `test:${d}`,
      { width: 1, height: 1, data: [...COLORS[d], 255] },
    ]),
  )
  const polygons = elementPolygons(
    [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: Object.fromEntries(
          DIRECTIONS.map((d) => [d, { texture: `#${d}` }]),
        ),
      },
    ],
    Object.fromEntries(DIRECTIONS.map((d) => [d, `test:${d}`])),
  )
  const gui: Model['display'] = {
    gui: { rotation: [30, 225, 0], scale: [0.625, 0.625, 0.625] },
  }
  const size = 16
  const pixels = rasterize(polygons, gui!.gui!, textures, size, 1)
  const at = (x: number, y: number) =>
    Array.from(pixels.slice((y * size + x) * 4, (y * size + x) * 4 + 4))

  it('shows the top, the east face on the left and the north face on the right', () => {
    expect(at(8, 3)).toEqual([200, 0, 0, 255])
    // gui lighting: the left face is lit more than the right one
    const left = at(3, 10)
    const right = at(12, 10)
    expect(left[2]).toBeGreaterThan(0)
    expect(right[1]).toBeGreaterThan(0)
    expect(left[2]).toBeGreaterThan(right[1])
    expect(left[2]).toBeLessThan(200)
  })

  it('never draws the faces turned away', () => {
    const shown = new Set<string>()
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i + 3])
        shown.add([0, 1, 2].map((c) => (pixels[i + c] > 0 ? 1 : 0)).join(''))
    // red (up), green (north), blue (east) only: no yellow, magenta or cyan
    expect([...shown].sort()).toEqual(['001', '010', '100'])
  })

  it('leaves the corners transparent', () => {
    expect(at(0, 0)[3]).toBe(0)
    expect(at(15, 15)[3]).toBe(0)
  })
})
