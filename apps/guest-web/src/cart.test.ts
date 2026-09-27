import { describe, expect, it } from 'vitest'
import { calculateUnitPrice, useCartStore } from './cart'

describe('cart pricing', () => {
  it('adds selected modifier deltas to the base price', () => {
    expect(calculateUnitPrice(12.5, [
      { id: 'extra-cheese', name: 'Дополнительный сыр', price: 2.5 },
      { id: 'sauce', name: 'Соус', price: 1 },
    ])).toBe(16)
  })

  it('merges quantities for the same item and modifier set regardless of order', () => {
    useCartStore.setState({ items: [] })
    const first = { id: 'cheese', name: 'Сыр', price: 2.5 }
    const second = { id: 'sauce', name: 'Соус', price: 1 }
    useCartStore.getState().addItem({ itemId: 'pizza', quantity: 1, selectedModifiers: [first, second], unitPrice: 13.5 })
    useCartStore.getState().addItem({ itemId: 'pizza', quantity: 2, selectedModifiers: [second, first], unitPrice: 13.5 })
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(useCartStore.getState().items[0]?.quantity).toBe(3)
  })
})
