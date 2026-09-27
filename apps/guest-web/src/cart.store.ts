import { create } from 'zustand'

type CartState = {
  quantities: Record<string, number>
  itemCount: number
  addItem: (itemId: string) => void
}

export const useCartStore = create<CartState>((set) => ({
  quantities: {},
  itemCount: 0,
  addItem: (itemId) => set((state) => ({
    quantities: { ...state.quantities, [itemId]: (state.quantities[itemId] ?? 0) + 1 },
    itemCount: state.itemCount + 1,
  })),
}))
