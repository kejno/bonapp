import { useMemo, useState } from 'react'
import type { DateRangePreset, Granularity } from '@bonapp/shared-types'
import { computeGranularity } from '../utils/granularity'

function startOfDay(d: Date): Date {
  const result = new Date(d)
  result.setHours(0, 0, 0, 0)
  return result
}

function presetToRange(preset: DateRangePreset, now: Date): { from: Date; to: Date } {
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: new Date(now) }
    case 'week': {
      const from = new Date(now)
      from.setDate(from.getDate() - 7)
      return { from: startOfDay(from), to: new Date(now) }
    }
    case 'month': {
      const from = new Date(now)
      from.setDate(from.getDate() - 30)
      return { from: startOfDay(from), to: new Date(now) }
    }
    case 'custom':
      return { from: startOfDay(now), to: new Date(now) }
  }
}

export interface DateRange {
  preset: DateRangePreset
  from: Date
  to: Date
  granularity: Granularity
  setPreset: (preset: DateRangePreset) => void
  setCustomRange: (from: Date, to: Date) => void
}

export function useDateRange(initialPreset: DateRangePreset = 'today'): DateRange {
  const [preset, setPreset] = useState<DateRangePreset>(initialPreset)
  const [customFrom, setCustomFrom] = useState<Date | null>(null)
  const [customTo, setCustomTo] = useState<Date | null>(null)

  const { from, to } = useMemo(() => {
    if (preset === 'custom' && customFrom && customTo) {
      return { from: customFrom, to: customTo }
    }
    return presetToRange(preset, new Date())
  }, [preset, customFrom, customTo])

  const granularity = useMemo(() => computeGranularity(from, to), [from, to])

  function setCustomRange(newFrom: Date, newTo: Date) {
    setCustomFrom(newFrom)
    setCustomTo(newTo)
  }

  return { preset, from, to, granularity, setPreset, setCustomRange }
}
