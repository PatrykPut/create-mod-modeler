import type { ItemRate } from '../core/derive'
import { machineName } from '../core/machines'
import { useAnalysis } from './analysis'
import { formatRate, formatStress } from './format'
import { ItemIcon, ItemName } from './ItemIcon'
import { usePlanStore } from './store'

function RateList({
  title,
  rates,
  tone,
}: {
  title: string
  rates: ItemRate[]
  tone?: string
}) {
  const unit = usePlanStore((s) => s.plan.settings.timeUnit)
  if (rates.length === 0) return null
  return (
    <section className={`summary-section ${tone ?? ''}`}>
      <h2>{title}</h2>
      <ul>
        {rates.map(({ item, perMinute }) => (
          <li key={item}>
            <ItemIcon item={item} />
            <span className="summary-name">
              <ItemName item={item} />
            </span>
            <span className="summary-value">
              {formatRate(perMinute, unit, item)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Summary() {
  const { summary, ok } = useAnalysis()
  return (
    <aside className="summary">
      {!ok && <p className="summary-error">The plan could not be solved.</p>}
      <section className="summary-section">
        <h2>Stress</h2>
        <p className="summary-stress">{formatStress(summary.stress)}</p>
      </section>
      <RateList title="Inputs" rates={summary.inputs} />
      <RateList title="Products" rates={summary.products} />
      <RateList title="Surplus" rates={summary.surplus} tone="is-surplus" />
      <RateList title="Shortage" rates={summary.shortage} tone="is-shortage" />
      {summary.machines.length > 0 && (
        <section className="summary-section">
          <h2>Machines</h2>
          <ul>
            {summary.machines.map(({ machine, count }) => (
              <li key={machine}>
                <span className="summary-count">{count}×</span>
                <span className="summary-name">{machineName(machine)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}
