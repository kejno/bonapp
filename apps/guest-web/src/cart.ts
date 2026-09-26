import { create } from 'zustand'

export type SelectedModifier = { id: string; name: string; price: number }
export type CartItem = { itemId: string; quantity: number; selectedModifiers: SelectedModifier[]; unitPrice: number }

type CartState = {
  items: CartItem[]
  addItem: (item: CartItem) => void
  itemCount: () => number
}

export function calculateUnitPrice(basePrice: number, modifiers: SelectedModifier[]): number {
  const cents = Math.round(basePrice * 100) + modifiers.reduce((sum, modifier) => sum + Math.round(modifier.price * 100), 0)
  return cents / 100
}

function sameSelection(left: SelectedModifier[], right: SelectedModifier[]): boolean {
  const leftIds = left.map(({ id }) => id).sort()
  const rightIds = right.map(({ id }) => id).sort()
  return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index])
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  addItem: (item) => set((state) => {
    const existing = state.items.find((candidate) => candidate.itemId === item.itemId && sameSelection(candidate.selectedModifiers, item.selectedModifiers))
    if (!existing) return { items: [...state.items, item] }
    return { items: state.items.map((candidate) => candidate === existing ? { ...candidate, quantity: candidate.quantity + item.quantity } : candidate) }
  }),
  itemCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
}))
