import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_ITEMS_PER_ENTRY, TRANSPORT_NOTES } from '../core/logistics'
import type { PlanEdge, Transport } from '../core/model/plan'
import { isFluid } from '../core/units'
import { useAnalysis } from './analysis'
import { formatRate } from './format'
import { NumberField } from './nodes/NumberField'
import { usePlanStore } from './store'
import { Info } from './Tooltip'

export type TransportFlowEdge = Edge<{ edge: PlanEdge }, 'transport'>

type TransportType = Transport['type'] | 'ideal'

const LANE_NAMES: Record<TransportType, [string, string]> = {
  ideal: ['', ''],
  belt: ['belt', 'belts'],
  chute: ['chute', 'chutes'],
  pipe: ['pipe', 'pipes'],
}

const TYPE_LABELS: Record<TransportType, string> = {
  ideal: 'Ideal (no limit)',
  belt: 'Belt',
  chute: 'Chute',
  pipe: 'Pipe',
}

export function TransportEdge(props: EdgeProps<TransportFlowEdge>) {
  const { id, data, selected } = props
  const [path, labelX, labelY] = getBezierPath(props)
  const [open, setOpen] = useState(false)
  const label = useRef<HTMLDivElement>(null)
  // close the popover on a click anywhere else
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!label.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const analysis = useAnalysis().edges[id]
  const settings = usePlanStore((s) => s.plan.settings)
  const updateEdge = usePlanStore((s) => s.updateEdge)
  if (!data) return null

  const { edge } = data
  const transport = edge.transport
  const type: TransportType = transport?.type ?? 'ideal'
  const fluid = isFluid(edge.item)
  const types: TransportType[] = fluid
    ? ['ideal', 'pipe']
    : ['ideal', 'belt', 'chute']
  const over = analysis?.over ?? false
  const lanes = analysis?.lanes ?? 1
  const [one, many] = LANE_NAMES[type]
  const unit = settings.timeUnit

  const setTransport = (patch: Partial<Transport> | null) =>
    updateEdge(id, {
      transport:
        patch === null ? undefined : ({ ...transport, ...patch } as Transport),
    })

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={`react-flow__edge-path ${over ? 'is-over' : ''}`}
      />
      <EdgeLabelRenderer>
        <div
          ref={label}
          className={`edge-label nodrag nopan ${over ? 'is-over' : ''} ${selected ? 'is-selected' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <button
            className="edge-label-button"
            data-tip={
              analysis?.limit === undefined
                ? 'Click to choose belt, chute or pipe'
                : `Limit ${formatRate(analysis.limit, unit, edge.item)} per ${one}`
            }
            onClick={() => setOpen(!open)}
          >
            {formatRate(analysis?.flow ?? 0, unit, edge.item)}
            {type !== 'ideal' &&
              (over ? ` · needs ${lanes} ${many}` : ` · ${one}`)}
          </button>
          {open && (
            <div className="edge-popover">
              <label className="field">
                <span>Transport</span>
                <select
                  value={type}
                  onChange={(e) => {
                    const next = e.target.value as TransportType
                    setTransport(next === 'ideal' ? null : { type: next })
                  }}
                >
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              {(type === 'belt' || type === 'pipe') && (
                <NumberField
                  label={type === 'pipe' ? 'Pump RPM' : 'Belt RPM'}
                  value={transport?.rpm}
                  placeholder={String(settings.rpm)}
                  min={1}
                  max={256}
                  onChange={(rpm) => setTransport({ rpm })}
                />
              )}
              {(type === 'belt' || type === 'chute') && (
                <NumberField
                  label="Items per entry"
                  value={transport?.itemsPerEntry}
                  placeholder={String(DEFAULT_ITEMS_PER_ENTRY)}
                  min={1}
                  max={64}
                  step={1}
                  title="1 = single items (andesite funnel, machine output); up to 64 with a brass funnel"
                  onChange={(itemsPerEntry) => setTransport({ itemsPerEntry })}
                />
              )}
              <p className="edge-limit">
                {analysis?.limit === undefined
                  ? 'No limit'
                  : `${formatRate(analysis.limit, unit, edge.item)} per ${one}`}{' '}
                <Info tip={TRANSPORT_NOTES[type]} />
              </p>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
