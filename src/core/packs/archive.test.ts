import { strToU8, zipSync, type Zippable } from 'fflate'
import { describe, expect, it } from 'vitest'
import { ArchiveError, describePack, readArchive } from './archive'

const json = (value: unknown) => strToU8(JSON.stringify(value))
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

const MODS_TOML = `
modLoader = "javafml"
loaderVersion = "[4,)"

[[mods]]
modId = "createaddition"
version = "\${file.jarVersion}"
displayName = "Create Crafts & Additions"
description = '''
modId = "not_a_mod"
'''

[[dependencies.createaddition]]
modId = "create"
`

function jar(files: Zippable) {
  return zipSync(files)
}

describe('readArchive', () => {
  const archive = readArchive(
    jar({
      'META-INF/neoforge.mods.toml': strToU8(MODS_TOML),
      'META-INF/MANIFEST.MF': strToU8(
        'Manifest-Version: 1.0\r\nImplementation-Version: 1.3.1\r\n',
      ),
      'com/example/Mod.class': new Uint8Array([0xca, 0xfe]),
      'data/createaddition/recipe/rolling/iron_ingot.json': json({
        type: 'createaddition:rolling',
      }),
      'data/createaddition/recipe/crushing/diamond.json': json({
        type: 'create:crushing',
      }),
      'data/c/tags/item/rods/iron.json': json({
        values: ['createaddition:iron_rod'],
      }),
      'data/createaddition/tags/fluid/bioethanol.json': json({
        values: ['createaddition:bioethanol'],
      }),
      'data/createaddition/tags/block/fan_processing_catalysts/charging.json':
        json({ values: ['createaddition:tesla_coil'] }),
      'data/minecraft/tags/block/mineable/pickaxe.json': json({
        values: ['createaddition:tesla_coil'],
      }),
      'assets/createaddition/lang/en_us.json': json({
        'item.createaddition.iron_rod': 'Iron Rod',
      }),
      'assets/createaddition/lang/de_de.json': json({}),
      'assets/createaddition/models/item/iron_rod.json': json({
        parent: 'minecraft:item/generated',
      }),
      'assets/createaddition/textures/item/iron_rod.png': PNG,
      'assets/createaddition/textures/entity/thing.png': PNG,
    }),
  )

  it('reads the mod id, name and the jar version', () => {
    expect(archive.mods).toEqual([
      {
        id: 'createaddition',
        name: 'Create Crafts & Additions',
        version: '1.3.1',
      },
    ])
  })

  it('reads recipes by id', () => {
    expect(Object.keys(archive.recipes).sort()).toEqual([
      'createaddition:crushing/diamond',
      'createaddition:rolling/iron_ingot',
    ])
    expect(archive.recipes['createaddition:rolling/iron_ingot']).toEqual({
      type: 'createaddition:rolling',
    })
  })

  it('reads item and fluid tags, and block tags only for fan catalysts', () => {
    expect(archive.tags).toEqual([
      {
        kind: 'item',
        tag: 'c:rods/iron',
        json: { values: ['createaddition:iron_rod'] },
      },
      {
        kind: 'fluid',
        tag: 'createaddition:bioethanol',
        json: { values: ['createaddition:bioethanol'] },
      },
      {
        kind: 'block',
        tag: 'createaddition:fan_processing_catalysts/charging',
        json: { values: ['createaddition:tesla_coil'] },
      },
    ])
  })

  it('reads English names, item/block models and item/block textures', () => {
    expect(archive.lang).toEqual({ 'item.createaddition.iron_rod': 'Iron Rod' })
    expect(Object.keys(archive.models)).toEqual([
      'createaddition:item/iron_rod',
    ])
    expect(archive.textures).toEqual({ 'createaddition:item/iron_rod': PNG })
  })

  it('lists the namespaces the archive brings', () => {
    expect(archive.namespaces).toEqual(['createaddition'])
  })

  it('reads mods nested in META-INF/jarjar', () => {
    const outer = readArchive(
      jar({
        'META-INF/jarjar/inner.jar': jar({
          'META-INF/neoforge.mods.toml': strToU8(
            '[[mods]]\nmodId="inner"\nversion="2.0"\n',
          ),
          'data/inner/recipe/x.json': json({ type: 'create:milling' }),
        }),
        'data/outer/recipe/y.json': json({ type: 'create:milling' }),
        'META-INF/neoforge.mods.toml': strToU8(
          '[[mods]]\nmodId="outer"\nversion="1.0"\n',
        ),
      }),
    )
    // the jar's own mod first: it names the pack
    expect(outer.mods.map((m) => m.id)).toEqual(['outer', 'inner'])
    expect(Object.keys(outer.recipes).sort()).toEqual(['inner:x', 'outer:y'])
    expect(outer.namespaces).toEqual(['inner', 'outer'])
  })

  it('skips recipe files that are not valid JSON', () => {
    const broken = readArchive(
      jar({
        'data/x/recipe/bad.json': strToU8('{ nope'),
        'data/x/recipe/good.json': json({ type: 'create:milling' }),
      }),
    )
    expect(Object.keys(broken.recipes)).toEqual(['x:good'])
  })

  it('rejects files that are not zip archives', () => {
    expect(() => readArchive(strToU8('hello'))).toThrow(ArchiveError)
  })

  it('rejects the Minecraft 1.20.1 layout', () => {
    expect(() =>
      readArchive(
        jar({ 'data/old/recipes/x.json': json({ type: 'create:milling' }) }),
      ),
    ).toThrow(/1\.20\.1/)
  })

  it('rejects archives without recipes or tags', () => {
    expect(() =>
      readArchive(jar({ 'assets/x/lang/en_us.json': json({}) })),
    ).toThrow(/no recipes/)
  })
})

describe('describePack', () => {
  const empty = {
    mods: [],
    namespaces: [],
    recipes: {},
    tags: [],
    lang: {},
    models: {},
    textures: {},
  }

  it('uses the mod of the jar', () => {
    const mod = { id: 'a', name: 'A', version: '1' }
    expect(describePack({ ...empty, mods: [mod] }, 'a-1.jar')).toBe(mod)
  })

  it('names datapacks after their file', () => {
    expect(describePack(empty, 'my_tweaks.zip')).toEqual({
      id: 'file:my_tweaks',
      name: 'my_tweaks',
      version: '',
    })
  })
})
