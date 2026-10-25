import { useEffect, useRef, useState } from 'react'
import { summaryCsv } from '../core/export'
import {
  decodeShare,
  encodeShare,
  parsePlanFile,
  PlanFileError,
  toPlanFile,
} from '../core/model/file'
import { useAnalysis } from './analysis'
import type { Catalog } from '../core/catalog'
import { useCatalog, usePackStore } from './packs'
import { usePlanStore } from './store'

const SHARE_PREFIX = '#plan='
const NOTICE_MS = 4000

function download(fileName: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

const fileNameOf = (name: string) =>
  name.trim().replace(/[^\w.-]+/g, '_') || 'plan'

/** Mentions sources dropped on import (core/sources.ts). */
const removedNote = (removed: string[], catalog: Catalog) =>
  removed.length === 0
    ? ''
    : ` Removed sources no farm or generator makes: ${removed.map((item) => catalog.item(item).name).join(', ')}.`

const messageOf = (error: unknown) =>
  error instanceof PlanFileError ? error.message : 'Something went wrong.'

/** Opens a plan from a share link in the address bar, then removes it from the URL. */
function useShareLinks(notify: (text: string) => void) {
  const importPlan = usePlanStore((s) => s.importPlan)
  useEffect(() => {
    const load = () => {
      if (!location.hash.startsWith(SHARE_PREFIX)) return
      const code = location.hash.slice(SHARE_PREFIX.length)
      history.replaceState(null, '', location.pathname + location.search)
      decodeShare(code)
        .then(({ name, plan, removed }) => {
          importPlan(name, plan)
          notify(
            `Opened the shared plan "${name}".${removedNote(removed, usePackStore.getState().catalog)}`,
          )
        })
        .catch((error) => notify(messageOf(error)))
    }
    load()
    window.addEventListener('hashchange', load)
    return () => window.removeEventListener('hashchange', load)
  }, [importPlan, notify])
}

export function PlanMenu() {
  const { plan, currentId, library } = usePlanStore()
  const store = usePlanStore.getState
  const analysis = useAnalysis()
  const catalog = useCatalog()
  const fileInput = useRef<HTMLInputElement>(null)
  const menu = useRef<HTMLDetailsElement>(null)
  const [notice, setNotice] = useState<string>()
  const [notify] = useState(() => (text: string) => {
    setNotice(text)
    setTimeout(() => setNotice(undefined), NOTICE_MS)
  })
  useShareLinks(notify)
  // close the File menu on a click elsewhere
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node))
        menu.current?.removeAttribute('open')
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  const current = library[currentId]
  const plans = Object.values(library).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  const run = async (action: () => void | Promise<void>) => {
    menu.current?.removeAttribute('open')
    try {
      await action()
    } catch (error) {
      notify(messageOf(error))
    }
  }

  const exportJson = () =>
    download(
      `${fileNameOf(current.name)}.json`,
      JSON.stringify(toPlanFile(current.name, plan), null, 2),
      'application/json',
    )
  const exportCsv = () =>
    download(
      `${fileNameOf(current.name)}-summary.csv`,
      summaryCsv(analysis, catalog, plan.settings.timeUnit),
      'text/csv',
    )
  const copyLink = async () => {
    const code = await encodeShare(current.name, plan)
    const url = `${location.origin}${location.pathname}${SHARE_PREFIX}${code}`
    try {
      await navigator.clipboard.writeText(url)
      notify('Share link copied to the clipboard.')
    } catch {
      prompt('Copy the share link:', url)
    }
  }
  const importFile = async (file: File) => {
    const { name, plan: imported, removed } = parsePlanFile(await file.text())
    store().importPlan(name, imported)
    notify(`Imported "${name}".${removedNote(removed, catalog)}`)
  }

  return (
    <div className="plan-menu">
      <select
        aria-label="Open plan"
        value={currentId}
        onChange={(e) => store().openPlan(e.target.value)}
      >
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input
        className="plan-name"
        aria-label="Plan name"
        value={current?.name ?? ''}
        onChange={(e) => store().renamePlan(currentId, e.target.value)}
      />
      <button className="button" onClick={() => store().newPlan()}>
        New
      </button>
      <details className="dropdown" ref={menu}>
        <summary className="button">File</summary>
        <div className="dropdown-menu">
          <button onClick={() => run(() => store().duplicatePlan(currentId))}>
            Duplicate plan
          </button>
          <button onClick={() => run(() => fileInput.current?.click())}>
            Import JSON…
          </button>
          <button onClick={() => run(exportJson)}>Export JSON</button>
          <button onClick={() => run(copyLink)}>Copy share link</button>
          <button onClick={() => run(exportCsv)}>Export summary CSV</button>
          <button
            className="is-danger"
            onClick={() =>
              run(() => {
                if (confirm(`Delete the plan "${current.name}"?`))
                  store().deletePlan(currentId)
              })
            }
          >
            Delete plan
          </button>
        </div>
      </details>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) run(() => importFile(file))
        }}
      />
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
    </div>
  )
}
