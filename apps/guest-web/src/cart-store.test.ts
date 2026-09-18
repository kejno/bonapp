import { beforeEach, describe, expect, it } from 'vitest'
import { useCartStore } from './cart-store'

describe('cart store', () => {
  beforeEach(() => useCartStore.getState().clear())

  it('keeps modifiers when quantity changes and clears only after a successful order', () => {
    useCartStore.getState().add({ menuItemId: 'coffee', name: 'Coffee', unitPriceByn: 5, selectedModifiers: ['oat'] })
    useCartStore.getState().setQuantity('coffee', ['oat'], 2)

    expect(useCartStore.getState().items).toEqual([expect.objectContaining({ quantity: 2, selectedModifiers: ['oat'] })])
    useCartStore.getState().clear()
    expect(useCartStore.getState().items).toEqual([])
    expect(useCartStore.getState().comment).toBe('')
  })
})
