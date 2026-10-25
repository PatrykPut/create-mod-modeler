// Addon recipe packs and the catalog built from the base data plus the active packs (DESIGN §6).
import { create } from 'zustand'
import { createCatalog, type Catalog } from '../core/catalog'
import { snapshotAddons, withAddons } from '../core/model/addons'
import type { AddonRecipes } from '../core/model/plan'
import { ArchiveError, describePack, readArchive } from '../core/packs/archive'
import { buildPacks, mergeGameData, type PackReport } from '../core/packs/build'
import baseData from '../data/create-6.0.10.json'
import type { GameData, ResourceId } from '../data/types'
import { deletePack, loadPacks, savePack, type StoredPack } from './packDb'
import { usePlanStore } from './store'

const base = baseData as GameData
const baseCatalog = createCatalog(base)

interface PackState {
  /** In the order they were added; later packs override earlier ones. */
  packs: StoredPack[]
  catalog: Catalog
  /** Object URLs of pack icons by resource id. */
  iconUrls: Record<ResourceId, string>
  /** PNG bytes of pack icons by resource id. */
  icons: Record<ResourceId, Uint8Array>
  /** Pack id of every recipe from an active pack. */
  recipePack: Record<string, string>
  /** Reports of the active packs by pack id. */
  reports: Record<string, PackReport>
  /** Stored packs are loaded (the catalog may still be the base one before). */
  loaded: boolean
  load(): Promise<void>
  /** Reads, stores and activates the files; a pack with the same mod id is replaced. */
  addFiles(files: File[]): Promise<{ added: StoredPack[]; errors: string[] }>
  setEnabled(id: string, enabled: boolean): Promise<void>
  remove(id: string): Promise<void>
}

const byAdded = (packs: StoredPack[]) =>
  [...packs].sort((a, b) => a.addedAt - b.addedAt)

export const usePackStore = create<PackState>()((set, get) => {
  /** Rebuilds the catalog from the active packs. */
  async function activate(packs: StoredPack[]) {
    const active = packs.filter((p) => p.enabled)
    let catalog = baseCatalog
    let iconUrls: Record<ResourceId, string> = {}
    let icons: Record<ResourceId, Uint8Array> = {}
    let recipePack: Record<string, string> = {}
    let reports: Record<string, PackReport> = {}
    if (active.length > 0) {
      // only needed with packs, so not part of the main bundle
      const { default: baseTags } = await import('../data/tags-1.21.1.json')
      const built = buildPacks(active, base, baseTags)
      catalog = createCatalog(mergeGameData(base, built.data))
      iconUrls = Object.fromEntries(
        Object.entries(built.icons).map(([id, png]) => [
          id,
          URL.createObjectURL(
            new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }),
          ),
        ]),
      )
      icons = built.icons
      recipePack = built.recipePack
      reports = Object.fromEntries(built.reports.map((r) => [r.id, r]))
    }
    for (const url of Object.values(get().iconUrls)) URL.revokeObjectURL(url)
    set({ packs, catalog, iconUrls, icons, recipePack, reports })
  }

  return {
    packs: [],
    catalog: baseCatalog,
    iconUrls: {},
    icons: {},
    recipePack: {},
    reports: {},
    loaded: false,
    load: async () => {
      const packs = byAdded(await loadPacks())
      await activate(packs)
      set({ loaded: true })
    },
    addFiles: async (files) => {
      const added: StoredPack[] = []
      const errors: string[] = []
      const packs = new Map(get().packs.map((p) => [p.id, p]))
      for (const file of files) {
        try {
          const archive = readArchive(new Uint8Array(await file.arrayBuffer()))
          const { id, name, version } = describePack(archive, file.name)
          const pack: StoredPack = {
            id,
            name,
            version,
            fileName: file.name,
            enabled: true,
            addedAt: Date.now(),
            archive,
          }
          packs.set(id, pack)
          added.push(pack)
          await savePack(pack)
        } catch (error) {
          errors.push(
            `${file.name}: ${error instanceof ArchiveError ? error.message : 'could not be read.'}`,
          )
        }
      }
      await activate(byAdded([...packs.values()]))
      return { added, errors }
    },
    setEnabled: async (id, enabled) => {
      const packs = get().packs.map((p) =>
        p.id === id ? { ...p, enabled } : p,
      )
      const pack = packs.find((p) => p.id === id)
      if (pack) await savePack(pack)
      await activate(packs)
    },
    remove: async (id) => {
      await deletePack(id)
      await activate(get().packs.filter((p) => p.id !== id))
    },
  }
})

/** Keeps the open plan's copy of its addon recipes current (core/model/addons.ts). */
function syncAddons() {
  const { catalog, packs, icons, recipePack } = usePackStore.getState()
  const { plan, setAddons } = usePlanStore.getState()
  const addons = snapshotAddons(
    plan,
    catalog,
    {
      recipePack,
      icons,
      packs: Object.fromEntries(
        packs.map((p) => [p.id, { name: p.name, version: p.version }]),
      ),
    },
    base,
  )
  if (JSON.stringify(addons) !== JSON.stringify(plan.addons)) setAddons(addons)
}

// only rerun when the catalog, the saved copy or the plan's recipes change (not on every drag)
let syncedKey: unknown[] = []
function maybeSyncAddons() {
  const { catalog, packs } = usePackStore.getState()
  const { plan } = usePlanStore.getState()
  const recipes = plan.nodes
    .flatMap((n) => (n.kind === 'recipe' ? [n.recipeId] : []))
    .join(' ')
  const key = [catalog, packs, plan.addons, recipes]
  if (key.every((part, i) => part === syncedKey[i])) return
  syncedKey = key
  syncAddons()
}
usePackStore.subscribe(maybeSyncAddons)
usePlanStore.subscribe(maybeSyncAddons)

let merged: { catalog: Catalog; addons?: AddonRecipes; result: Catalog }

/** The catalog of the base data plus the active packs, with the open plan's saved addon recipes. */
export function planCatalog(catalog: Catalog, addons?: AddonRecipes): Catalog {
  if (merged?.catalog !== catalog || merged.addons !== addons)
    merged = { catalog, addons, result: withAddons(catalog, addons) }
  return merged.result
}

export const useCatalog = () =>
  planCatalog(
    usePackStore((s) => s.catalog),
    usePlanStore((s) => s.plan.addons),
  )
