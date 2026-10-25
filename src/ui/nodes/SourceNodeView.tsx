import type { Node, NodeProps } from '@xyflow/react'
import { DRILL, GENERATED_BLOCKS } from '../../core/machines'
import type { SourceNode } from '../../core/model/plan'
import { SOURCE_KINDS, sourceKind } from '../../core/sources'
import { fromPerMinute, toPerMinute } from '../../core/units'
import { useAnalysis } from '../analysis'
import { formatNumber, formatPercent, formatStress } from '../format'
import { usePlanStore } from '../store'
import { Info } from '../Tooltip'
import { NumberField } from './NumberField'
import { PortRow } from './PortRow'

export type SourceFlowNode = Node<{ node: SourceNode }, 'source'>

export function SourceNodeView({ data: { node } }: NodeProps<SourceFlowNode>) {
  const analysis = useAnalysis().nodes[node.id]
  const settings = usePlanStore((s) => s.plan.settings)
  const updateNode = usePlanStore((s) => s.updateSourceNode)
  if (!analysis) return null
  const unit = settings.timeUnit
  const unlimited = node.perMinute === null
  const drillable = node.item in GENERATED_BLOCKS
  const drilled = drillable && node.drill !== false
  const kind = SOURCE_KINDS[sourceKind(node.item) ?? 'generator']

  return (
    <div className="node node-source">
      <header className="node-header">
        <span className="node-title">
          Source · {drilled ? DRILL.name : kind.name}
        </span>
        <Info tip={drilled ? DRILL.note : kind.note} />
      </header>
      <div className="node-ports">
        <div />
        <div>
          {analysis.solved.outputs.map((port) => (
            <PortRow key={port.item} side="out" port={port} unit={unit} />
          ))}
        </div>
      </div>
      {drilled && (
        <div className="node-stats">
          <span data-tip="Drills needed (exact → built), utilisation">
            {formatNumber(analysis.machines.exact)} →{' '}
            <strong>{analysis.machines.count}×</strong>{' '}
            {analysis.machines.count > 0 &&
              `(${formatPercent(analysis.machines.utilization)})`}
          </span>
          <span className="node-stress">{formatStress(analysis.stress)}</span>
        </div>
      )}
      <div className="node-fields">
        {!unlimited && (
          <NumberField
            label="Rate"
            value={fromPerMinute(node.perMinute ?? 0, unit)}
            onChange={(value) =>
              value !== undefined &&
              updateNode(node.id, { perMinute: toPerMinute(value, unit) })
            }
          />
        )}
        <label className="field nodrag">
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(e) =>
              updateNode(node.id, { perMinute: e.target.checked ? null : 60 })
            }
          />
          <span>Unlimited</span>
        </label>
        {drillable && (
          <label className="field nodrag" data-tip={DRILL.note}>
            <input
              type="checkbox"
              checked={drilled}
              onChange={(e) => updateNode(node.id, { drill: e.target.checked })}
            />
            <span>Drills</span>
          </label>
        )}
        {drilled && (
          <NumberField
            label="RPM"
            value={node.rpm}
            placeholder={String(settings.rpm)}
            min={1}
            max={256}
            title="Overrides the global RPM for the drills"
            onChange={(rpm) => updateNode(node.id, { rpm })}
          />
        )}
      </div>
    </div>
  )
}
