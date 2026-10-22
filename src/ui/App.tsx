import { ReactFlowProvider } from '@xyflow/react'
import { useMemo } from 'react'
import { analyze } from '../core/derive'
import type { TimeUnit } from '../core/units'
import { AnalysisContext } from './analysis'
import { Canvas } from './Canvas'
import { catalog } from './catalog'
import { NumberField } from './nodes/NumberField'
import { usePlanStore } from './store'
import { Summary } from './Summary'

const UNITS: { value: TimeUnit; label: string }[] = [
  { value: 'second', label: 'per second' },
  { value: 'minute', label: 'per minute' },
  { value: 'hour', label: 'per hour' },
]

export function App() {
  const plan = usePlanStore((s) => s.plan)
  const updateSettings = usePlanStore((s) => s.updateSettings)
  const clear = usePlanStore((s) => s.clear)
  const analysis = useMemo(() => analyze(plan, catalog), [plan])
  const { meta } = catalog.data

  return (
    <AnalysisContext.Provider value={analysis}>
      <div className="app">
        <header className="app-header">
          <h1>Create Mod Modeler</h1>
          <span className="app-version">
            Create {meta.create} · Minecraft {meta.minecraft}
          </span>
          <div className="app-settings">
            <NumberField
              label="Global RPM"
              value={plan.settings.rpm}
              min={1}
              max={256}
              onChange={(rpm) => rpm !== undefined && updateSettings({ rpm })}
            />
            <label className="field">
              <span>Rates</span>
              <select
                value={plan.settings.timeUnit}
                onChange={(e) =>
                  updateSettings({ timeUnit: e.target.value as TimeUnit })
                }
              >
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button"
              onClick={() => confirm('Discard the current plan?') && clear()}
            >
              New plan
            </button>
          </div>
        </header>
        <div className="app-body">
          <main className="app-canvas">
            <ReactFlowProvider>
              <Canvas />
            </ReactFlowProvider>
          </main>
          <Summary />
        </div>
        <footer className="app-footer">
          Not affiliated with Mojang, Microsoft or the Create team. Textures ©
          their owners.
        </footer>
      </div>
    </AnalysisContext.Provider>
  )
}
