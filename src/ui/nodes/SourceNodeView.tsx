import type { Node, NodeProps } from '@xyflow/react'
import type { SourceNode } from '../../core/model/plan'
import { fromPerMinute, toPerMinute } from '../../core/units'
import { useAnalysis } from '../analysis'
import { usePlanStore } from '../store'
import { NumberField } from './NumberField'
import { PortRow } from './PortRow'

export type SourceFlowNode = Node<{ node: SourceNode }, 'source'>

export function SourceNodeView({ data: { node } }: NodeProps<SourceFlowNode>) {
  const analysis = useAnalysis().nodes[node.id]
  const unit = usePlanStore((s) => s.plan.settings.timeUnit)
  const updateNode = usePlanStore((s) => s.updateSourceNode)
  if (!analysis) return null
  const unlimited = node.perMinute === null

  return (
    <div className="node node-source">
      <header className="node-header">
        <span className="node-title">Source</span>
      </header>
      <div className="node-ports">
        <div />
        <div>
          {analysis.solved.outputs.map((port) => (
            <PortRow key={port.item} side="out" port={port} unit={unit} />
          ))}
        </div>
      </div>
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
      </div>
    </div>
  )
}
