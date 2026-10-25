import { useRef, useState } from 'react'
import type { PackReport } from '../core/packs/build'
import { usePackStore } from './packs'

const ACCEPT = '.jar,.zip'

function skippedText(report: PackReport) {
  const entries = Object.entries(report.skipped).sort(([, a], [, b]) => b - a)
  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  return {
    total,
    tip: entries.map(([reason, count]) => `${count}× ${reason}`).join('\n'),
  }
}

/** Addon recipe packs: import mod jars / datapacks, switch them on and off, remove them. */
export function PackDialog({ onClose }: { onClose(): void }) {
  const { packs, reports, addFiles, setEnabled, remove } = usePackStore()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [messages, setMessages] = useState<string[]>([])

  const importFiles = async (files: File[]) => {
    if (files.length === 0) return
    setBusy(true)
    try {
      const { added, errors } = await addFiles(files)
      setMessages([...added.map((p) => `Loaded ${p.name}.`), ...errors])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog pack-dialog"
        role="dialog"
        aria-label="Addon recipes"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="dialog-head">
          <h2 className="dialog-title">Addon recipes</h2>
          <button className="button" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
        <button
          className={dragging ? 'pack-drop is-dragging' : 'pack-drop'}
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void importFiles([...e.dataTransfer.files])
          }}
        >
          {busy ? (
            'Reading…'
          ) : (
            <>
              <strong>Drop mod .jar or datapack .zip files here</strong>
              <span>
                or click to choose them. Use mods for Minecraft 1.21.1 from your
                mods folder. Files are read in your browser and never uploaded.
              </span>
            </>
          )}
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          aria-label="Choose addon files"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            void importFiles(files)
          }}
        />
        {messages.length > 0 && (
          <ul className="pack-messages" role="status">
            {messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        <ul className="pack-list">
          {packs.length === 0 && (
            <li className="dialog-empty">No addons loaded.</li>
          )}
          {packs.map((pack) => {
            const report = reports[pack.id]
            const skipped = report && skippedText(report)
            return (
              <li key={pack.id} className="pack-row">
                <label className="pack-name">
                  <input
                    type="checkbox"
                    checked={pack.enabled}
                    onChange={(e) => void setEnabled(pack.id, e.target.checked)}
                  />
                  <span>
                    {pack.name}
                    {pack.version && <small> {pack.version}</small>}
                  </span>
                </label>
                <span className="pack-stats">
                  {report
                    ? `${report.recipes} ${report.recipes === 1 ? 'recipe' : 'recipes'}`
                    : 'off'}
                  {skipped && skipped.total > 0 && (
                    <span className="pack-skipped" data-tip={skipped.tip}>
                      {' · '}
                      {skipped.total} skipped
                    </span>
                  )}
                </span>
                <button
                  className="button pack-remove"
                  aria-label={`Remove ${pack.name}`}
                  onClick={() => void remove(pack.id)}
                >
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
