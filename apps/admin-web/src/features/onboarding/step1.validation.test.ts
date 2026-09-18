import { describe, expect, it } from 'vitest'
import { createSlug, isValidUnp } from './step1.validation'

describe('isValidUnp', () => {
  it.each(['123456789', '000000000'])('accepts a nine-digit UNP: %s', (unp) => {
    expect(isValidUnp(unp)).toBe(true)
  })

  it.each(['12345678', '1234567890', '123-456-789', 'abcdefghi'])(
    'rejects an invalid UNP: %s',
    (unp) => {
      expect(isValidUnp(unp)).toBe(false)
    },
  )
})

describe('createSlug', () => {
  it('transliterates a Cyrillic restaurant name', () => {
    expect(createSlug('Кафе У Петра')).toBe('kafe-u-petra')
  })

  it('normalizes separators in Latin names', () => {
    expect(createSlug('Bonapp & Friends!')).toBe('bonapp-friends')
  })
})
