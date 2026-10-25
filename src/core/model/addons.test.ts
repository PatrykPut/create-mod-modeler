import { describe, expect, it } from 'vitest'
import type { GameData, Recipe } from '../../data/types'
import { createCatalog } from '../catalog'
import {
  missingPacks,
  readAddons,
  snapshotAddons,
  snapshotPack,
  withAddons,
  type ActivePacks,
} from './addons'
import { emptyPlan, type AddonRecipes, type Plan } from './plan'

const meta = { create: 'test', minecraft: 'test', createTag: 'test' }

const base: GameData = {
  meta,
  items: {
    'minecraft:iron_ingot': { id: 'minecraft:iron_ingot', name: 'Iron Ingot' },
  },
  tags: {},
  recipes: [
    {
      id: 'create:pressing/iron_ingot',
      type: 'pressing',
      inputs: [{ item: 'minecraft:iron_ingot', amount: 1 }],
      outputs: [{ item: 'create:iron_sheet', amount: 1, chance: 1 }],
    },
  ],
}

const plate: Recipe = {
  id: 'addon:pressing/plate',
  type: 'pressing',
  inputs: [{ item: '#addon:rods', amount: 1 }],
  outputs: [{ item: 'addon:plate', amount: 1, chance: 1 }],
}

const rod: Recipe = {
  id: 'addon:cutting/rod',
  type: 'cutting',
  inputs: [{ item: 'minecraft:iron_ingot', amount: 1 }],
  outputs: [{ item: 'addon:iron_rod', amount: 2, chance: 1 }],
}

/** Base data with the addon's items, tag and recipes, as packs.ts builds it. */
const withPack: GameData = {
  meta,
  items: {
    ...base.items,
    'addon:plate': { id: 'addon:plate', name: 'Plate' },
    'addon:iron_rod': { id: 'addon:iron_rod', name: 'Iron Rod' },
    'addon:gold_rod': { id: 'addon:gold_rod', name: 'Gold Rod' },
    '#addon:rods': { id: '#addon:rods', name: 'Rods' },
  },
  tags: { '#addon:rods': ['addon:iron_rod', 'addon:gold_rod'] },
  recipes: [...base.recipes, plate, rod],
}

const active: ActivePacks = {
  recipePack: { [plate.id]: 'addon', [rod.id]: 'addon' },
  packs: { addon: { name: 'Addon', version: '1.0' } },
  icons: { 'addon:plate': new Uint8Array([1, 2, 3]) },
}

const node = (id: string, recipeId: string) => ({
  id,
  kind: 'recipe' as const,
  recipeId,
  machineId: 'mechanical_press' as const,
  position: { x: 0, y: 0 },
})

const planOf = (...recipeIds: string[]): Plan => ({
  ...emptyPlan(),
  nodes: recipeIds.map((r, i) => node(String(i), r)),
})

const snapshot: AddonRecipes = {
  packs: { addon: { name: 'Addon', version: '1.0' } },
  recipes: [plate],
  recipePack: { [plate.id]: 'addon' },
  items: {
    '#addon:rods': { id: '#addon:rods', name: 'Rods' },
    'addon:plate': { id: 'addon:plate', name: 'Plate' },
    'addon:iron_rod': { id: 'addon:iron_rod', name: 'Iron Rod' },
    'addon:gold_rod': { id: 'addon:gold_rod', name: 'Gold Rod' },
  },
  tags: { '#addon:rods': ['addon:iron_rod', 'addon:gold_rod'] },
  icons: { 'addon:plate': 'data:image/png;base64,AQID' },
}

describe('snapshotAddons', () => {
  const catalog = createCatalog(withPack)

  it('keeps the pack recipes the plan uses with their addon items, tags and icons', () => {
    const plan = planOf(plate.id, 'create:pressing/iron_ingot', plate.id)
    expect(snapshotAddons(plan, catalog, active, base)).toEqual(snapshot)
  })

  it('leaves out base items', () => {
    const addons = snapshotAddons(planOf(rod.id), catalog, active, base)
    expect(Object.keys(addons!.items)).toEqual(['addon:iron_rod'])
    expect(addons!.icons).toBeUndefined()
  })

  it('is empty without pack recipes', () => {
    const plan = planOf('create:pressing/iron_ingot')
    expect(snapshotAddons(plan, catalog, active, base)).toBeUndefined()
  })

  it('keeps the saved copy of a recipe the catalog lacks', () => {
    const plan = { ...planOf(plate.id), addons: snapshot }
    expect(
      snapshotAddons(
        plan,
        createCatalog(base),
        {
          recipePack: {},
          packs: {},
          icons: {},
        },
        base,
      ),
    ).toEqual(snapshot)
  })

  it('takes the loaded pack over the saved copy', () => {
    const changed = { ...plate, processingTime: 40 }
    const plan = { ...planOf(plate.id), addons: snapshot }
    const addons = snapshotAddons(
      plan,
      createCatalog({ ...withPack, recipes: [changed, rod] }),
      active,
      base,
    )
    expect(addons!.recipes).toEqual([changed])
  })

  it('drops recipes no node uses any more', () => {
    const plan = { ...planOf(), addons: snapshot }
    expect(snapshotAddons(plan, catalog, active, base)).toBeUndefined()
  })
})

describe('withAddons', () => {
  const catalog = withAddons(createCatalog(base), snapshot)

  it('falls back to the saved recipes, items and tags', () => {
    expect(catalog.recipe(plate.id)).toEqual(plate)
    expect(catalog.item('addon:plate').name).toBe('Plate')
    expect(catalog.members('#addon:rods')).toEqual(snapshot.tags['#addon:rods'])
    expect(catalog.accepts('#addon:rods', 'addon:gold_rod')).toBe(true)
    expect(catalog.machinesFor(plate)).toEqual(['mechanical_press'])
  })

  it('keeps saved recipes out of the recipe lists', () => {
    expect(catalog.options().map((o) => o.recipe.id)).not.toContain(plate.id)
  })

  it('prefers the loaded pack', () => {
    const changed = { ...plate, processingTime: 40 }
    const loaded = createCatalog({ ...withPack, recipes: [changed] })
    expect(withAddons(loaded, snapshot).recipe(plate.id)).toEqual(changed)
  })
})

describe('missing packs', () => {
  it('names the pack of a recipe only the plan has', () => {
    const pack = { id: 'addon', name: 'Addon', version: '1.0' }
    expect(snapshotPack(snapshot, createCatalog(base), plate.id)).toEqual(pack)
    expect(missingPacks(snapshot, createCatalog(base))).toEqual([pack])
  })

  it('is nothing while the pack is loaded', () => {
    const catalog = createCatalog(withPack)
    expect(snapshotPack(snapshot, catalog, plate.id)).toBeUndefined()
    expect(missingPacks(snapshot, catalog)).toEqual([])
  })
})

describe('readAddons', () => {
  it('reads saved addon recipes', () => {
    expect(readAddons(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
  })

  it('drops broken recipes, icons that are no PNG data and empty sections', () => {
    const value = {
      ...snapshot,
      recipes: [
        plate,
        { ...plate, id: 'unknown', type: 'rolling' },
        { ...plate, id: 'no-outputs', outputs: 'x' },
        { ...plate, id: 'heat', heat: 'lukewarm' },
      ],
      icons: { 'addon:plate': 'https://example.com/x.png' },
    }
    expect(readAddons(value)).toEqual({ ...snapshot, icons: undefined })
    expect(readAddons({ ...snapshot, recipes: [] })).toBeUndefined()
    expect(readAddons('nope')).toBeUndefined()
  })
})
