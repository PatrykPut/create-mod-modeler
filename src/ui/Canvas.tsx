import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type FinalConnectionState,
  type IsValidConnection,
  type NodeChange,
} from '@xyflow/react'
import { useCallback, useMemo, useState } from 'react'
import { targetPortOf, type PlanEdge, type Position } from '../core/model/plan'
import { AddDialog, type AddChoice, type AddRequest } from './AddDialog'
import { catalog } from './catalog'
import { handleId, itemOfHandle } from './nodes/handles'
import { PowerNodeView, type PowerFlowNode } from './nodes/PowerNodeView'
import { RecipeNodeView, type RecipeFlowNode } from './nodes/RecipeNodeView'
import { SourceNodeView, type SourceFlowNode } from './nodes/SourceNodeView'
import { usePlanStore } from './store'
import { TransportEdge, type TransportFlowEdge } from './TransportEdge'

type FlowNode = RecipeFlowNode | SourceFlowNode | PowerFlowNode

const nodeTypes = {
  recipe: RecipeNodeView,
  source: SourceNodeView,
  power: PowerNodeView,
}
const edgeTypes = { transport: TransportEdge }

// rough width of a recipe node, for placing new nodes left of a dragged input port
const NODE_WIDTH = 280

interface DialogState {
  request: AddRequest
  position: Position
  /** Port the user dragged from; the new node gets wired to it. */
  from?: { node: string; side: 'in' | 'out'; item: string }
}

/** An edge carrying `item` into the input port `port` (a tag the item belongs to, or the item). */
function edgeBetween(
  source: string,
  target: string,
  item: string,
  port: string,
): Omit<PlanEdge, 'id'> {
  return { source, target, item, ...(port !== item && { targetItem: port }) }
}

export function Canvas() {
  const plan = usePlanStore((s) => s.plan)
  const store = usePlanStore.getState
  const { screenToFlowPosition } = useReactFlow()
  const [dialog, setDialog] = useState<DialogState>()

  // The plan is the source of truth; React Flow's own per-node state (measured size,
  // selection, dragging) is kept alongside and merged in.
  const [nodeState, setNodeState] = useState(
    new Map<string, Partial<FlowNode>>(),
  )
  const [selectedEdges, setSelectedEdges] = useState(new Set<string>())

  const nodes = useMemo(
    () =>
      plan.nodes.map(
        (node) =>
          ({
            ...nodeState.get(node.id),
            id: node.id,
            type: node.kind,
            position: node.position,
            data: { node },
          }) as FlowNode,
      ),
    [plan.nodes, nodeState],
  )

  const edges = useMemo<TransportFlowEdge[]>(
    () =>
      plan.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: handleId('out', edge.item),
        targetHandle: handleId('in', targetPortOf(edge)),
        type: 'transport',
        data: { edge },
        className: 'flow-edge',
        selected: selectedEdges.has(edge.id),
      })),
    [plan.edges, selectedEdges],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const next = applyNodeChanges(changes, nodes)
      setNodeState(
        new Map(
          next.map(({ id, measured, selected, dragging }) => [
            id,
            { measured, selected, dragging },
          ]),
        ),
      )
      const removed: string[] = []
      for (const change of changes) {
        if (change.type === 'position' && change.position)
          store().moveNode(change.id, change.position)
        if (change.type === 'remove') removed.push(change.id)
      }
      if (removed.length) store().removeNodes(removed)
    },
    [nodes, store],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<TransportFlowEdge>[]) => {
      const next = applyEdgeChanges(changes, edges)
      setSelectedEdges(new Set(next.filter((e) => e.selected).map((e) => e.id)))
      const removed = changes.flatMap((c) =>
        c.type === 'remove' ? [c.id] : [],
      )
      if (removed.length) store().removeEdges(removed)
    },
    [edges, store],
  )

  const isValidConnection: IsValidConnection = (c) => {
    const item = itemOfHandle(c.sourceHandle)
    const port = itemOfHandle(c.targetHandle)
    return (
      c.source !== c.target &&
      item !== undefined &&
      port !== undefined &&
      catalog.accepts(port, item)
    )
  }

  const onConnect = (c: Connection) =>
    store().connect(
      edgeBetween(
        c.source,
        c.target,
        itemOfHandle(c.sourceHandle)!,
        itemOfHandle(c.targetHandle)!,
      ),
    )

  // dropping a connection on empty canvas offers matching recipes
  const onConnectEnd = (
    event: MouseEvent | TouchEvent,
    state: FinalConnectionState,
  ) => {
    if (state.isValid || !state.fromHandle?.id || !state.fromNode) return
    const point = 'changedTouches' in event ? event.changedTouches[0] : event
    const item = itemOfHandle(state.fromHandle.id)!
    const side = state.fromHandle.type === 'source' ? 'out' : 'in'
    const drop = screenToFlowPosition({ x: point.clientX, y: point.clientY })
    setDialog({
      request:
        side === 'out'
          ? { kind: 'recipe', consumes: item }
          : { kind: 'recipe', produces: item },
      // put the new node's matching port side next to the drop point
      position: {
        x: side === 'out' ? drop.x + 20 : drop.x - NODE_WIDTH - 20,
        y: drop.y - 60,
      },
      from: { node: state.fromNode.id, side, item },
    })
  }

  const openAt = (request: AddRequest) =>
    setDialog({
      request,
      position: screenToFlowPosition({
        x: window.innerWidth / 2 - 150,
        y: window.innerHeight / 2 - 100,
      }),
    })

  const choose = (choice: AddChoice) => {
    if (!dialog) return
    const id =
      choice.kind === 'recipe'
        ? store().addRecipeNode(
            choice.option.recipe.id,
            choice.option.machine,
            dialog.position,
          )
        : store().addSourceNode(choice.item, dialog.position)
    const { from } = dialog
    if (from) {
      if (from.side === 'out') {
        // the new recipe's input that takes the item, possibly a tag
        const port =
          choice.kind === 'recipe'
            ? choice.option.recipe.inputs.find((i) =>
                catalog.accepts(i.item, from.item),
              )?.item
            : choice.item
        store().connect(
          edgeBetween(from.node, id, from.item, port ?? from.item),
        )
      } else {
        // the new node's output that fits the port, possibly a member of a tag
        const item =
          choice.kind === 'recipe'
            ? choice.option.recipe.outputs.find((o) =>
                catalog.accepts(from.item, o.item),
              )?.item
            : choice.item
        store().connect(
          edgeBetween(id, from.node, item ?? from.item, from.item),
        )
      }
    }
    setDialog(undefined)
  }

  return (
    <>
      <ReactFlow<FlowNode, TransportFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        deleteKeyCode={['Backspace', 'Delete']}
        colorMode="dark"
        fitView
        fitViewOptions={{ maxZoom: 1 }}
        minZoom={0.2}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
        <Panel position="top-left" className="canvas-toolbar">
          <button
            className="button button-primary"
            onClick={() => openAt({ kind: 'recipe' })}
          >
            + Recipe
          </button>
          <button className="button" onClick={() => openAt({ kind: 'source' })}>
            + Source
          </button>
          <button
            className="button"
            data-tip="Add a stress source; it covers the whole plan"
            onClick={() =>
              store().addPowerNode(
                'water_wheel',
                screenToFlowPosition({
                  x: window.innerWidth / 2 - 150,
                  y: window.innerHeight / 2 - 100,
                }),
              )
            }
          >
            + Power
          </button>
        </Panel>
        {plan.nodes.length === 0 && (
          <Panel position="top-center" className="canvas-hint">
            Add a source or a recipe, then drag from a port to connect or to add
            the next step.
          </Panel>
        )}
      </ReactFlow>
      {dialog && (
        <AddDialog
          request={dialog.request}
          onChoose={choose}
          onClose={() => setDialog(undefined)}
        />
      )}
    </>
  )
}
