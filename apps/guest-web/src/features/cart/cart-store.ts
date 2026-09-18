import { create } from 'zustand'

export type CartItem = {
  itemId: string
  quantity: number
  selectedModifiers: string[]
  unitPrice: number
}

type CartState = {
  items: CartItem[]
  addItem: (item: CartItem) => void
  clear: () => void
}

function haveSameModifiers(first: string[], second: string[]) {
  return [...first].sort().join('|') === [...second].sort().join('|')
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  addItem: (item) =>
    set((state) => {
      const existingIndex = state.items.findIndex(
        (cartItem) =>
          cartItem.itemId === item.itemId &&
          haveSameModifiers(cartItem.selectedModifiers, item.selectedModifiers),
      )

      if (existingIndex === -1) {
        return { items: [...state.items, item] }
      }

      return {
        items: state.items.map((cartItem, index) =>
          index === existingIndex
            ? { ...cartItem, quantity: cartItem.quantity + item.quantity }
            : cartItem,
        ),
      }
    }),
  clear: () => set({ items: [] }),
}))
