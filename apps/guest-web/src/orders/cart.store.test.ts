import { afterEach, describe, expect, it } from 'vitest'
import { useCartStore } from './cart.store'

afterEach(() => {
  useCartStore.getState().clear()
  useCartStore.persist.clearStorage()
})

describe('guest cart', () => {
  it('keeps quantities, selected modifiers, and the cook comment across page navigation', async () => {
    useCartStore.getState().addItem({ id: 'dish-1', name: 'Борщ', priceByn: 8.5, quantity: 1, selectedModifiers: ['sour-cream'] })
    useCartStore.getState().setComment('Без зелени')

    const persisted = JSON.parse(localStorage.getItem('guest-cart') ?? '{}') as { state?: { items?: unknown[]; comment?: string } }

    expect(persisted.state?.items).toEqual([
      { id: 'dish-1', lineId: 'dish-1:sour-cream', name: 'Борщ', priceByn: 8.5, quantity: 1, selectedModifiers: ['sour-cream'] },
    ])
    expect(persisted.state?.comment).toBe('Без зелени')
  })

  it('keeps the same dish in separate lines when modifier choices differ', () => {
    useCartStore.getState().addItem({ id: 'dish-1', name: 'Борщ', priceByn: 8.5, quantity: 1, selectedModifiers: ['sour-cream'] })
    useCartStore.getState().addItem({ id: 'dish-1', name: 'Борщ', priceByn: 9, quantity: 1, selectedModifiers: ['bacon'] })

    expect(useCartStore.getState().items).toHaveLength(2)
    expect(useCartStore.getState().items.map((item) => item.selectedModifiers)).toEqual([['sour-cream'], ['bacon']])
  })

  it('updates quantities and removes a line when its quantity reaches zero', () => {
    useCartStore.getState().addItem({ id: 'dish-1', name: 'Борщ', priceByn: 8.5, quantity: 1, selectedModifiers: [] })
    const lineId = useCartStore.getState().items[0]?.lineId ?? ''
    useCartStore.getState().setQuantity(lineId, 2)
    expect(useCartStore.getState().items[0]?.quantity).toBe(2)

    useCartStore.getState().setQuantity(lineId, 0)
    expect(useCartStore.getState().items).toEqual([])
  })
})
