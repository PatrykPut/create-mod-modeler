import { fromPerMinute, type TimeUnit } from '../core/units'

const UNIT_SUFFIX: Record<TimeUnit, string> = {
  second: '/s',
  minute: '/min',
  hour: '/h',
}

export function formatNumber(value: number): string {
  const abs = Math.abs(value)
  const digits = abs === 0 || abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3
  return value.toLocaleString('en-US', { maximumFractionDigits: digits })
}

export function formatRate(perMinute: number, unit: TimeUnit): string {
  return `${formatNumber(fromPerMinute(perMinute, unit))}${UNIT_SUFFIX[unit]}`
}

export function formatStress(su: number): string {
  return `${Math.round(su).toLocaleString('en-US')} SU`
}

export const formatPercent = (ratio: number) =>
  `${(ratio * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })} %`
