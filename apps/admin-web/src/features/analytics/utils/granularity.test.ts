import { describe, expect, it } from 'vitest'
import { computeGranularity } from './granularity'

describe('computeGranularity', () => {
  it('returns hour for a same-day range', () => {
    const from = new Date('2026-09-17T00:00:00Z')
    const to = new Date('2026-09-17T23:59:59Z')
    expect(computeGranularity(from, to)).toBe('hour')
  })

  it('returns hour for exactly 1 day range', () => {
    const from = new Date('2026-09-16T00:00:00Z')
    const to = new Date('2026-09-17T00:00:00Z')
    expect(computeGranularity(from, to)).toBe('hour')
  })

  it('returns day for a 7-day range', () => {
    const from = new Date('2026-09-10T00:00:00Z')
    const to = new Date('2026-09-17T00:00:00Z')
    expect(computeGranularity(from, to)).toBe('day')
  })

  it('returns day for a 30-day range', () => {
    const from = new Date('2026-08-18T00:00:00Z')
    const to = new Date('2026-09-17T00:00:00Z')
    expect(computeGranularity(from, to)).toBe('day')
  })

  it('returns day for exactly 31-day range', () => {
    const from = new Date('2026-08-17T00:00:00Z')
    const to = new Date('2026-09-17T00:00:00Z')
    expect(computeGranularity(from, to)).toBe('day')
  })

  it('returns week for a range over 31 days', () => {
    const from = new Date('2026-07-01T00:00:00Z')
    const to = new Date('2026-09-17T00:00:00Z')
    expect(computeGranularity(from, to)).toBe('week')
  })
})
