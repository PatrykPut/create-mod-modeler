// The summary panel as CSV, for spreadsheets.
import type { Catalog } from './catalog'
import type { ItemRate, PlanAnalysis } from './derive'
import { machineName } from './names'
import { fromPerMinute, isFluid, type TimeUnit } from './units'

const UNIT_SUFFIX: Record<TimeUnit, string> = {
  second: 's',
  minute: 'min',
  hour: 'h',
}
const DECIMALS = 3

function cell(value: string | number) {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const round = (value: number) => Number(value.toFixed(DECIMALS))

export function summaryCsv(
  analysis: PlanAnalysis,
  catalog: Catalog,
  unit: TimeUnit,
): string {
  const { summary } = analysis
  const rows: (string | number)[][] = [
    ['section', 'id', 'name', 'amount', 'unit'],
  ]
  const rates = (section: string, list: ItemRate[]) => {
    for (const { item, perMinute } of list)
      rows.push([
        section,
        item,
        catalog.item(item).name,
        round(fromPerMinute(perMinute, unit)),
        `${isFluid(item) ? 'mB' : 'items'}/${UNIT_SUFFIX[unit]}`,
      ])
  }
  rates('input', summary.inputs)
  rates('product', summary.products)
  rates('surplus', summary.surplus)
  rates('shortage', summary.shortage)
  for (const { machine, count } of summary.machines)
    rows.push(['machine', machine, machineName(machine), count, 'machines'])
  rows.push(['stress', '', 'Stress used', round(summary.stress), 'SU'])
  rows.push(['stress', '', 'Stress capacity', round(summary.capacity), 'SU'])
  // CRLF line endings as in RFC 4180
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}
