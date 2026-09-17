import type { Granularity } from '@bonapp/shared-types'

export function computeGranularity(from: Date, to: Date): Granularity {
  const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)
  if (diffDays <= 1) return 'hour'
  if (diffDays <= 31) return 'day'
  return 'week'
}
