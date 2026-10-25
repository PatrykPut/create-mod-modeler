import { useEffect, useMemo, useRef, useState } from 'react'
import type { RecipeOption } from '../core/catalog'
import { MACHINES } from '../core/machines'
import { SOURCE_KINDS, SOURCES, sourceKind } from '../core/sources'
import { catalog } from './catalog'
import { ItemIcon } from './ItemIcon'

/** What the dialog offers: recipes (optionally producing/consuming an item) or a source. */
export type AddRequest =
  | { kind: 'recipe'; produces?: string; consumes?: string }
  | { kind: 'source'; item?: string }

export type AddChoice =
  { kind: 'recipe'; option: RecipeOption } | { kind: 'source'; item: string }

const MAX_RESULTS = 60

function matches(query: string, ...items: string[]) {
  if (!query) return true
  const q = query.toLowerCase()
  return items.some(
    (item) =>
      item.includes(q) || catalog.item(item).name.toLowerCase().includes(q),
  )
}

function RecipeSummary({ option }: { option: RecipeOption }) {
  const { recipe, machine } = option
  return (
    <>
      <span className="recipe-io">
        {recipe.inputs.map((i) => (
          <span key={i.item} className="recipe-stack">
            {i.amount > 1 && `${i.amount}×`}
            <ItemIcon item={i.item} />
          </span>
        ))}
        <span className="recipe-arrow">→</span>
        {recipe.outputs.map((o) => (
          <span key={o.item + o.chance} className="recipe-stack">
            {o.amount > 1 && `${o.amount}×`}
            <ItemIcon item={o.item} />
            {o.chance < 1 && <small>{Math.round(o.chance * 1000) / 10}%</small>}
          </span>
        ))}
      </span>
      <span className="recipe-label">
        {recipe.outputs.map((o) => catalog.item(o.item).name).join(', ')}
        <small>
          {' · '}
          <ItemIcon item={MACHINES[machine].block} size={16} />{' '}
          {MACHINES[machine].name}
        </small>
      </span>
    </>
  )
}

export function AddDialog({
  request,
  onChoose,
  onClose,
}: {
  request: AddRequest
  onChoose(choice: AddChoice): void
  onClose(): void
}) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState(request.kind)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  const recipeResults = useMemo(() => {
    if (kind !== 'recipe' || request.kind !== 'recipe') return []
    const pool = request.produces
      ? catalog.producers(request.produces)
      : request.consumes
        ? catalog.consumers(request.consumes)
        : catalog.options()
    return pool
      .filter(({ recipe }) =>
        matches(
          query,
          ...recipe.outputs.map((o) => o.item),
          ...recipe.inputs.map((i) => i.item),
        ),
      )
      .slice(0, MAX_RESULTS)
  }, [kind, request, query])

  const sourceResults = useMemo(() => {
    if (kind !== 'source') return []
    const fixed = request.kind === 'source' ? request.item : request.produces
    // only what a farm, generator or pump makes; a tag port takes any such member
    return (fixed ? catalog.members(fixed) : SOURCES.map((s) => s.item))
      .filter((item) => sourceKind(item) && matches(query, item))
      .slice(0, MAX_RESULTS)
  }, [kind, request, query])

  // an input port can also be fed from a source, if one can make its item
  const canSwitchToSource =
    request.kind === 'recipe' &&
    request.produces !== undefined &&
    catalog.members(request.produces).some((item) => sourceKind(item))

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-label="Add node"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="dialog-head">
          <input
            ref={input}
            className="dialog-search"
            placeholder={
              kind === 'recipe' ? 'Search recipes by item…' : 'Search sources…'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {canSwitchToSource && (
            <button
              className="button"
              onClick={() => setKind(kind === 'recipe' ? 'source' : 'recipe')}
            >
              {kind === 'recipe' ? 'Use a source instead' : 'Show recipes'}
            </button>
          )}
        </div>
        <ul className="dialog-results">
          {kind === 'recipe' &&
            recipeResults.map((option) => (
              <li key={option.recipe.id + option.machine}>
                <button onClick={() => onChoose({ kind: 'recipe', option })}>
                  <RecipeSummary option={option} />
                </button>
              </li>
            ))}
          {kind === 'source' &&
            sourceResults.map((item) => (
              <li key={item}>
                <button onClick={() => onChoose({ kind: 'source', item })}>
                  <ItemIcon item={item} />
                  <span className="recipe-label">
                    Source of {catalog.item(item).name}
                    <small>
                      {' · '}
                      <ItemIcon
                        item={SOURCE_KINDS[sourceKind(item)!].block}
                        size={16}
                      />{' '}
                      {SOURCE_KINDS[sourceKind(item)!].name}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          {(kind === 'recipe' ? recipeResults : sourceResults).length === 0 && (
            <li className="dialog-empty">Nothing found.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
