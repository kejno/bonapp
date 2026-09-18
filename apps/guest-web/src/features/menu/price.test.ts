import { describe, expect, it } from 'vitest'
import { calculateUnitPrice } from './price'

describe('calculateUnitPrice', () => {
  it('adds every selected modifier delta to the base price', () => {
    expect(calculateUnitPrice(12.5, [2.5, 1.25])).toBe(16.25)
  })
})
