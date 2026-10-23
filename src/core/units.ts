// All rates in core are stored per minute; the UI converts for display.

export type TimeUnit = 'second' | 'minute' | 'hour'

const MINUTES_PER_UNIT: Record<TimeUnit, number> = {
  second: 1 / 60,
  minute: 1,
  hour: 60,
}

export const TICKS_PER_SECOND = 20

/** Fluids are resources with a "fluid:" prefix; their amounts are in mB. */
export const isFluid = (resource: string) => resource.startsWith('fluid:')

export function fromPerMinute(ratePerMinute: number, unit: TimeUnit): number {
  return ratePerMinute * MINUTES_PER_UNIT[unit]
}

export function toPerMinute(rate: number, unit: TimeUnit): number {
  return rate / MINUTES_PER_UNIT[unit]
}

/** Rate per minute of something that completes once every `ticks` game ticks. */
export function perMinuteFromTicks(ticks: number): number {
  return (TICKS_PER_SECOND * 60) / ticks
}
