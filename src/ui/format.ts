import { fromPerMinute, isFluid, type TimeUnit } from '../core/units'

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

/** @param resource fluids are shown in mB */
export function formatRate(
  perMinute: number,
  unit: TimeUnit,
  resource?: string,
): string {
  const mB = resource && isFluid(resource) ? ' mB' : ''
  return `${formatNumber(fromPerMinute(perMinute, unit))}${mB}${UNIT_SUFFIX[unit]}`
}

export function formatStress(su: number): string {
  return `${Math.round(su).toLocaleString('en-US')} SU`
}

export const formatPercent = (ratio: number) =>
  `${(ratio * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })} %`
