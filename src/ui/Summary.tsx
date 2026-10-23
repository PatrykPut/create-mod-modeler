import type { ItemRate } from '../core/derive'
import { machineName } from '../core/names'
import { useAnalysis } from './analysis'
import { formatPercent, formatRate, formatStress } from './format'
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

function StressSection() {
  const { summary } = useAnalysis()
  const hasPower = usePlanStore((s) =>
    s.plan.nodes.some((n) => n.kind === 'power'),
  )
  const { stress, capacity } = summary
  const over = hasPower && stress > capacity + 1e-6
  return (
    <section className="summary-section">
      <h2>Stress</h2>
      <p className={`summary-stress ${over ? 'is-over' : ''}`}>
        {formatStress(stress)}
        {hasPower && (
          <span className="summary-capacity"> / {formatStress(capacity)}</span>
        )}
      </p>
      {hasPower && capacity > 0 && (
        <div
          className={`stress-bar ${over ? 'is-over' : ''}`}
          title={`${formatPercent(stress / capacity)} of the capacity used`}
        >
          <div
            style={{ width: `${Math.min(100, (stress / capacity) * 100)}%` }}
          />
        </div>
      )}
      {over && (
        <p className="summary-warning">
          {formatStress(stress - capacity)} missing: the network overstresses.
        </p>
      )}
      {!hasPower && (
        <p className="summary-hint">Add a power source to compare.</p>
      )}
    </section>
  )
}

function Bottlenecks() {
  const { summary } = useAnalysis()
  if (summary.bottlenecks.length === 0) return null
  return (
    <section className="summary-section is-shortage">
      <h2>Bottlenecks</h2>
      <ul>
        {summary.bottlenecks.map(({ edge, item, lanes }) => (
          <li key={edge}>
            <ItemIcon item={item} />
            <span className="summary-name">
              <ItemName item={item} />
            </span>
            <span className="summary-value">needs {lanes} lanes</span>
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
      <StressSection />
      <Bottlenecks />
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
