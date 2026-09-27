import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface CartItem {
  id: string
  lineId: string
  name: string
  priceByn: number
  quantity: number
  selectedModifiers: string[]
}

interface CartState {
  items: CartItem[]
  comment: string
  addItem: (item: Omit<CartItem, 'lineId'>) => void
  setQuantity: (lineId: string, quantity: number) => void
  removeItem: (lineId: string) => void
  setComment: (comment: string) => void
  clear: () => void
}

export const useCartStore = create<CartState>()(persist((set) => ({
  items: [],
  comment: '',
  addItem: (item) => set((state) => {
    const lineId = `${item.id}:${[...item.selectedModifiers].sort().join(',')}`
    const existing = state.items.find((candidate) => candidate.lineId === lineId)
    return { items: existing
      ? state.items.map((candidate) => candidate.lineId === lineId ? { ...candidate, quantity: Math.min(20, candidate.quantity + 1) } : candidate)
      : [...state.items, { ...item, lineId }] }
  }),
  setQuantity: (lineId, quantity) => set((state) => ({ items: quantity < 1
    ? state.items.filter((item) => item.lineId !== lineId)
    : state.items.map((item) => item.lineId === lineId ? { ...item, quantity: Math.min(20, quantity) } : item) })),
  removeItem: (lineId) => set((state) => ({ items: state.items.filter((item) => item.lineId !== lineId) })),
  setComment: (comment) => set({ comment }),
  clear: () => set({ items: [], comment: '' }),
}), { name: 'guest-cart', storage: createJSONStorage(() => localStorage) }))
