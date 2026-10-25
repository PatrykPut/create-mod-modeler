import type { Node, NodeProps } from '@xyflow/react'
import type { PowerNode, PowerSourceId } from '../../core/model/plan'
import { DEFAULT_SAILS, POWER_SOURCES } from '../../core/power'
import { useAnalysis } from '../analysis'
import { formatStress } from '../format'
import { ItemIcon, MACHINE_ICON_SIZE } from '../ItemIcon'
import { usePlanStore } from '../store'
import { Info } from '../Tooltip'
import { NumberField } from './NumberField'

export type PowerFlowNode = Node<{ node: PowerNode }, 'power'>

export function PowerNodeView({ data: { node } }: NodeProps<PowerFlowNode>) {
  const analysis = useAnalysis().power[node.id]
  const settings = usePlanStore((s) => s.plan.settings)
  const updateNode = usePlanStore((s) => s.updatePowerNode)
  if (!analysis) return null
  const source = POWER_SOURCES[node.source]
  const steam = node.source === 'steam_engine'

  return (
    <div className="node node-power">
      <header className="node-header">
        <ItemIcon item={source.block} size={MACHINE_ICON_SIZE} />
        <select
          className="nodrag"
          value={node.source}
          onChange={(e) =>
            updateNode(node.id, { source: e.target.value as PowerSourceId })
          }
        >
          {Object.values(POWER_SOURCES).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {source.note && <Info tip={source.note} />}
      </header>

      <div className="node-stats">
        <span>
          <strong>{analysis.count}×</strong>
          {node.count === undefined && ' (auto)'}
        </span>
        <span className="node-capacity">
          +{formatStress(analysis.capacity)}
        </span>
      </div>
      {steam && analysis.boiler && analysis.boiler.boilers > 0 && (
        <div className="node-stats">
          <span data-tip="One boiler level per engine; level 18 at most">
            Boiler level {analysis.boiler.level}
            {analysis.boiler.boilers > 1 && ` × ${analysis.boiler.boilers}`}
          </span>
          <span
            className="node-stress"
            data-tip="Water pumps: 1 per boiler up to level 12, 2 from level 13"
          >
            {analysis.pumps}× pump · {formatStress(analysis.stress)}
          </span>
        </div>
      )}

      <div className="node-fields">
        <NumberField
          label={steam ? 'Engines' : 'Count'}
          value={node.count}
          placeholder="auto"
          min={0}
          step={1}
          title="Leave empty to build enough for the remaining stress"
          onChange={(count) => updateNode(node.id, { count })}
        />
        {source.usesSails && (
          <NumberField
            label="Sails"
            value={node.sails}
            placeholder={String(DEFAULT_SAILS)}
            min={8}
            step={1}
            title="Sail blocks (sails, wool) on the windmill"
            onChange={(sails) => updateNode(node.id, { sails })}
          />
        )}
        {source.usesRpm && (
          <NumberField
            label={steam ? 'Pump RPM' : 'RPM'}
            value={node.rpm}
            placeholder={String(settings.rpm)}
            min={1}
            max={256}
            title={
              steam
                ? 'Speed of the water pumps feeding the boiler'
                : 'Speed set on the motor'
            }
            onChange={(rpm) => updateNode(node.id, { rpm })}
          />
        )}
      </div>
    </div>
  )
}
