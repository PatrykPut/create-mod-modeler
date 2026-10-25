import { create } from 'zustand'
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from 'zustand/middleware'
import type { MachineId } from '../core/machines'
import {
  emptyPlan,
  type AddonRecipes,
  type Plan,
  type PlanEdge,
  type PlanNode,
  type Position,
  type PowerNode,
  type PowerSourceId,
  type RecipeNode,
  type Settings,
  type SourceNode,
} from '../core/model/plan'
import { removeInvalidSources } from '../core/sources'

export interface SavedPlan {
  id: string
  name: string
  /** ms since epoch */
  updatedAt: number
  plan: Plan
}

interface PlanState {
  /** The open plan; also kept in `library` under `currentId`. */
  plan: Plan
  currentId: string
  library: Record<string, SavedPlan>
  newPlan(): void
  openPlan(id: string): void
  renamePlan(id: string, name: string): void
  duplicatePlan(id: string): void
  deletePlan(id: string): void
  /** Adds a plan (from a file or share link) and opens it. */
  importPlan(name: string, plan: Plan): void
  addRecipeNode(
    recipeId: string,
    machineId: MachineId,
    position: Position,
  ): string
  addSourceNode(item: string, position: Position): string
  addPowerNode(source: PowerSourceId, position: Position): string
  updateRecipeNode(id: string, patch: Partial<RecipeNode>): void
  updateSourceNode(id: string, patch: Partial<SourceNode>): void
  updatePowerNode(id: string, patch: Partial<PowerNode>): void
  moveNode(id: string, position: Position): void
  removeNodes(ids: string[]): void
  connect(edge: Omit<PlanEdge, 'id'>): void
  updateEdge(id: string, patch: Partial<PlanEdge>): void
  removeEdges(ids: string[]): void
  updateSettings(patch: Partial<Settings>): void
  /** Replaces the plan's saved addon recipes (kept current by packs.ts). */
  setAddons(addons: AddonRecipes | undefined): void
}

// Storage can be unavailable (private mode, blocked site data); the app then works without autosave.
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      // ignore
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {
      // ignore
    }
  },
}

const newId = () => crypto.randomUUID()

const DEFAULT_NAME = 'My plan'

function savedPlan(name: string, plan: Plan): SavedPlan {
  return { id: newId(), name, updatedAt: Date.now(), plan }
}

/** A name not yet used in the library: "Iron", "Iron (2)", … */
export function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name
  for (let i = 2; ; i++)
    if (!taken.includes(`${name} (${i})`)) return `${name} (${i})`
}

type Persisted = Pick<PlanState, 'currentId' | 'library'>

/**
 * Version 1 stored a single plan; it becomes the first plan of the library.
 * Version 3 drops sources no farm or generator makes (core/sources.ts).
 */
export function migrate(persisted: unknown, version: number): Persisted {
  let state = persisted as Persisted
  if (version < 2) {
    const { plan } = (persisted ?? {}) as { plan?: Plan }
    const first = savedPlan(DEFAULT_NAME, plan ?? emptyPlan())
    state = { currentId: first.id, library: { [first.id]: first } }
  }
  if (version < 3) {
    const library = Object.fromEntries(
      Object.entries(state.library).map(([id, saved]) => [
        id,
        { ...saved, plan: removeInvalidSources(saved.plan).plan },
      ]),
    )
    state = { ...state, library }
  }
  return state
}

const initial = savedPlan(DEFAULT_NAME, emptyPlan())

export const usePlanStore = create<PlanState>()(
  persist(
    (set, get) => {
      const update = (fn: (plan: Plan) => Partial<Plan>) =>
        set(({ plan, currentId, library }) => {
          const next = { ...plan, ...fn(plan) }
          const saved = {
            ...library[currentId],
            plan: next,
            updatedAt: Date.now(),
          }
          return { plan: next, library: { ...library, [currentId]: saved } }
        })
      const open = (saved: SavedPlan, library = get().library) =>
        set({
          plan: saved.plan,
          currentId: saved.id,
          library: { ...library, [saved.id]: saved },
        })
      const names = () => Object.values(get().library).map((p) => p.name)
      const addNode = (node: PlanNode) => {
        update((plan) => ({ nodes: [...plan.nodes, node] }))
        return node.id
      }
      const patchNode = (id: string, patch: Partial<PlanNode>) =>
        update((plan) => ({
          nodes: plan.nodes.map((n) =>
            n.id === id ? ({ ...n, ...patch } as PlanNode) : n,
          ),
        }))

      return {
        plan: initial.plan,
        currentId: initial.id,
        library: { [initial.id]: initial },
        newPlan: () =>
          open(savedPlan(uniqueName('New plan', names()), emptyPlan())),
        openPlan: (id) => {
          const saved = get().library[id]
          if (saved) open(saved)
        },
        renamePlan: (id, name) =>
          set(({ library }) => ({
            library: { ...library, [id]: { ...library[id], name } },
          })),
        duplicatePlan: (id) => {
          const source = get().library[id]
          if (source)
            open(
              savedPlan(
                uniqueName(`${source.name} copy`, names()),
                structuredClone(source.plan),
              ),
            )
        },
        deletePlan: (id) => {
          const { [id]: _removed, ...rest } = get().library
          const remaining = Object.values(rest).sort(
            (a, b) => b.updatedAt - a.updatedAt,
          )
          if (id !== get().currentId) return set({ library: rest })
          open(remaining[0] ?? savedPlan(DEFAULT_NAME, emptyPlan()), rest)
        },
        importPlan: (name, plan) =>
          open(savedPlan(uniqueName(name, names()), plan)),
        addRecipeNode: (recipeId, machineId, position) =>
          addNode({
            id: newId(),
            kind: 'recipe',
            recipeId,
            machineId,
            position,
          }),
        addSourceNode: (item, position) =>
          addNode({
            id: newId(),
            kind: 'source',
            item,
            perMinute: 60,
            position,
          }),
        addPowerNode: (source, position) =>
          addNode({ id: newId(), kind: 'power', source, position }),
        updateRecipeNode: patchNode,
        updateSourceNode: patchNode,
        updatePowerNode: patchNode,
        moveNode: (id, position) => patchNode(id, { position }),
        removeNodes: (ids) =>
          update((plan) => ({
            nodes: plan.nodes.filter((n) => !ids.includes(n.id)),
            edges: plan.edges.filter(
              (e) => !ids.includes(e.source) && !ids.includes(e.target),
            ),
          })),
        connect: (edge) =>
          update((plan) =>
            plan.edges.some(
              (e) =>
                e.source === edge.source &&
                e.target === edge.target &&
                e.item === edge.item &&
                e.targetItem === edge.targetItem,
            )
              ? {}
              : { edges: [...plan.edges, { ...edge, id: newId() }] },
          ),
        updateEdge: (id, patch) =>
          update((plan) => ({
            edges: plan.edges.map((e) =>
              e.id === id ? { ...e, ...patch } : e,
            ),
          })),
        removeEdges: (ids) =>
          update((plan) => ({
            edges: plan.edges.filter((e) => !ids.includes(e.id)),
          })),
        updateSettings: (patch) =>
          update((plan) => ({ settings: { ...plan.settings, ...patch } })),
        setAddons: (addons) => update(() => ({ addons })),
      }
    },
    {
      name: 'create-mod-modeler:plan',
      version: 3,
      storage: createJSONStorage(() => safeStorage),
      // the open plan is stored once, inside the library
      partialize: ({ currentId, library }): Persisted => ({
        currentId,
        library,
      }),
      migrate,
      merge: (persisted, current) => {
        const { currentId, library } = persisted as Persisted
        const open = library?.[currentId]
        return open
          ? { ...current, currentId, library, plan: open.plan }
          : current
      },
    },
  ),
)
