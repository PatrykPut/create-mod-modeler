import type { Node, NodeProps } from '@xyflow/react'
import { burnerFuels, FUELS } from '../../core/fuels'
import { MACHINES, recipeMachineName } from '../../core/machines'
import { DEFAULT_STACK_SIZE } from '../../core/derive'
import { snapshotPack } from '../../core/model/addons'
import { MAX_STACK_SIZE, type RecipeNode } from '../../core/model/plan'
import { fuelOf } from '../../core/model/ports'
import { fromPerMinute, toPerMinute } from '../../core/units'
import { useAnalysis } from '../analysis'
import { ItemIcon, MACHINE_ICON_SIZE } from '../ItemIcon'
import { formatNumber, formatPercent, formatStress } from '../format'
import { useCatalog, usePackStore } from '../packs'
import { usePlanStore } from '../store'
import { Info } from '../Tooltip'
import { NumberField } from './NumberField'
import { PortRow } from './PortRow'

export type RecipeFlowNode = Node<{ node: RecipeNode }, 'recipe'>

export function RecipeNodeView({ data: { node } }: NodeProps<RecipeFlowNode>) {
  const analysis = useAnalysis().nodes[node.id]
  const settings = usePlanStore((s) => s.plan.settings)
  const updateNode = usePlanStore((s) => s.updateRecipeNode)
  const catalog = useCatalog()
  const saved = snapshotPack(
    usePlanStore((s) => s.plan.addons),
    usePackStore((s) => s.catalog),
    node.recipeId,
  )
  const packLoaded = usePackStore((s) =>
    s.packs.some((p) => p.enabled && p.id === saved?.id),
  )
  const recipe = catalog.recipe(node.recipeId)
  const machine = MACHINES[node.machineId]
  if (!recipe || !analysis)
    return (
      <div className="node node-recipe">
        <p className="node-warning">
          Unknown recipe {node.recipeId}. Load the addon it comes from under
          Addons.
        </p>
      </div>
    )

  const unit = settings.timeUnit
  const machineOptions = catalog.machinesFor(recipe)
  const outputs = analysis.solved.outputs
  // fuel leftovers such as empty buckets cannot be a target
  const targetable = outputs.filter((o) =>
    recipe.outputs.some((r) => r.item === o.item),
  )
  const target = node.target
  const burning = fuelOf(node, catalog)
  const fuels = burning?.burner ? burnerFuels(recipe.heat!) : FUELS

  return (
    <div className="node node-recipe">
      <header className="node-header">
        <ItemIcon item={machine.block} size={MACHINE_ICON_SIZE} />
        {machineOptions.length > 1 ? (
          <select
            className="nodrag"
            value={node.machineId}
            onChange={(e) =>
              updateNode(node.id, {
                machineId: e.target.value as RecipeNode['machineId'],
              })
            }
          >
            {machineOptions.map((id) => (
              <option key={id} value={id}>
                {recipeMachineName(id, recipe)}
              </option>
            ))}
          </select>
        ) : (
          <span className="node-title">
            {recipeMachineName(node.machineId, recipe)}
          </span>
        )}
        {recipe.fan?.catalyst && (
          <span
            className="node-heat is-catalyst"
            data-tip="Catalyst: what the air current has to pass through"
          >
            {recipe.fan.catalyst}
          </span>
        )}
        {recipe.heat && (
          <span
            className={`node-heat is-${recipe.heat}`}
            data-tip={`Needs a ${recipe.heat} Blaze Burner under the basin`}
          >
            {recipe.heat === 'superheated' ? 'Superheated' : 'Heated'}
          </span>
        )}
        {machine.note && <Info tip={machine.note} />}
      </header>
      {saved && (
        <p
          className="node-warning"
          data-tip="Load the addon under Addons to use its current recipes"
        >
          {packLoaded
            ? `${saved.name} no longer has this recipe`
            : `${saved.name}${saved.version && ` ${saved.version}`} is not loaded`}
          ; using the copy saved in this plan.
        </p>
      )}
      {analysis.warning && <p className="node-warning">{analysis.warning}</p>}

      <div className="node-ports">
        <div>
          {analysis.solved.inputs.map((port) => (
            <PortRow key={port.item} side="in" port={port} unit={unit} />
          ))}
        </div>
        <div>
          {outputs.map((port) => (
            <PortRow key={port.item} side="out" port={port} unit={unit} />
          ))}
        </div>
      </div>

      <div className="node-stats">
        <span data-tip="Machines needed (exact → built), utilisation">
          {formatNumber(analysis.machines.exact)} →{' '}
          <strong>{analysis.machines.count}×</strong>{' '}
          {analysis.machines.count > 0 &&
            `(${formatPercent(analysis.machines.utilization)})`}
        </span>
        {analysis.burners !== undefined && analysis.burners > 0 && (
          <span data-tip="One Blaze Burner under each basin; burners burn fuel all the time, even while the machine idles">
            {analysis.burners}× Blaze Burner
          </span>
        )}
        <span className="node-stress">{formatStress(analysis.stress)}</span>
      </div>

      <div className="node-fields">
        {machine.usesRpm && (
          <NumberField
            label="RPM"
            value={node.rpm}
            placeholder={String(settings.rpm)}
            min={1}
            max={256}
            title="Overrides the global RPM for this node"
            onChange={(rpm) => updateNode(node.id, { rpm })}
          />
        )}
        {machine.usesStackSize && (
          <NumberField
            label="Stack size"
            value={node.stackSize}
            placeholder={String(settings.stackSize ?? DEFAULT_STACK_SIZE)}
            min={1}
            max={MAX_STACK_SIZE}
            step={1}
            title="Items per stack fed into the machine; overrides the plan's stack size"
            onChange={(stackSize) => updateNode(node.id, { stackSize })}
          />
        )}
        {machine.usesParallelStacks && (
          <NumberField
            label="Stacks in air"
            value={node.parallelStacks}
            placeholder="1"
            min={1}
            step={1}
            title="Stacks inside the air current at the same time"
            onChange={(parallelStacks) =>
              updateNode(node.id, { parallelStacks })
            }
          />
        )}
        <NumberField
          label="Target"
          value={target ? fromPerMinute(target.perMinute, unit) : undefined}
          placeholder="auto"
          title="Fix this node's output rate; everything else adapts"
          onChange={(value) =>
            updateNode(node.id, {
              target:
                value === undefined
                  ? undefined
                  : {
                      item: target?.item ?? targetable[0].item,
                      perMinute: toPerMinute(value, unit),
                    },
            })
          }
        />
        {target && targetable.length > 1 && (
          <select
            className="nodrag"
            value={target.item}
            onChange={(e) =>
              updateNode(node.id, {
                target: { ...target, item: e.target.value },
              })
            }
          >
            {targetable.map((o) => (
              <option key={o.item} value={o.item}>
                {catalog.item(o.item).name}
              </option>
            ))}
          </select>
        )}
        {burning && (
          <label
            className="field"
            data-tip="What the burners or the furnace burn"
          >
            <span>Fuel</span>
            <select
              className="nodrag"
              value={burning.fuel.item}
              onChange={(e) => updateNode(node.id, { fuel: e.target.value })}
            >
              {fuels.map((f) => (
                <option key={f.item} value={f.item}>
                  {catalog.item(f.item).name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  )
}
