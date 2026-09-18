import { beforeEach, describe, expect, it } from 'vitest'
import { useCartStore } from './cart-store'

describe('cart store', () => {
  beforeEach(() => useCartStore.getState().clear())

  it('merges items with the same item and selected modifiers', () => {
    const item = {
      itemId: 'pasta-carbonara',
      quantity: 1,
      selectedModifiers: ['extra-cheese'],
      unitPrice: 18.5,
    }

    useCartStore.getState().addItem(item)
    useCartStore.getState().addItem({ ...item, quantity: 2 })

    expect(useCartStore.getState().items).toEqual([{ ...item, quantity: 3 }])
  })

  it('keeps differently configured items as separate lines', () => {
    useCartStore.getState().addItem({
      itemId: 'pasta-carbonara',
      quantity: 1,
      selectedModifiers: ['extra-cheese'],
      unitPrice: 18.5,
    })
    useCartStore.getState().addItem({
      itemId: 'pasta-carbonara',
      quantity: 1,
      selectedModifiers: ['no-cheese'],
      unitPrice: 16,
    })

    expect(useCartStore.getState().items).toHaveLength(2)
  })
})
