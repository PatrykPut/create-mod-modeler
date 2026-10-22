import { create } from 'zustand'
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from 'zustand/middleware'
import type { MachineId } from '../core/machines'
import {
  emptyPlan,
  type Plan,
  type PlanEdge,
  type PlanNode,
  type Position,
  type RecipeNode,
  type Settings,
  type SourceNode,
} from '../core/model/plan'

interface PlanState {
  plan: Plan
  addRecipeNode(
    recipeId: string,
    machineId: MachineId,
    position: Position,
  ): string
  addSourceNode(item: string, position: Position): string
  updateRecipeNode(id: string, patch: Partial<RecipeNode>): void
  updateSourceNode(id: string, patch: Partial<SourceNode>): void
  moveNode(id: string, position: Position): void
  removeNodes(ids: string[]): void
  connect(edge: Omit<PlanEdge, 'id'>): void
  removeEdges(ids: string[]): void
  updateSettings(patch: Partial<Settings>): void
  clear(): void
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

export const usePlanStore = create<PlanState>()(
  persist(
    (set) => {
      const update = (fn: (plan: Plan) => Partial<Plan>) =>
        set(({ plan }) => ({ plan: { ...plan, ...fn(plan) } }))
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
        plan: emptyPlan(),
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
        updateRecipeNode: patchNode,
        updateSourceNode: patchNode,
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
                e.item === edge.item,
            )
              ? {}
              : { edges: [...plan.edges, { ...edge, id: newId() }] },
          ),
        removeEdges: (ids) =>
          update((plan) => ({
            edges: plan.edges.filter((e) => !ids.includes(e.id)),
          })),
        updateSettings: (patch) =>
          update((plan) => ({ settings: { ...plan.settings, ...patch } })),
        clear: () => set({ plan: emptyPlan() }),
      }
    },
    {
      name: 'create-mod-modeler:plan',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
    },
  ),
)
