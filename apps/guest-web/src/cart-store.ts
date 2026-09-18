import { create } from 'zustand'

export interface CartItem {
  menuItemId: string
  name: string
  unitPriceByn: number
  quantity: number
  selectedModifiers: string[]
}

type NewCartItem = Omit<CartItem, 'quantity'>

interface CartState {
  items: CartItem[]
  comment: string
  add: (item: NewCartItem) => void
  setQuantity: (menuItemId: string, selectedModifiers: string[], quantity: number) => void
  remove: (menuItemId: string, selectedModifiers: string[]) => void
  setComment: (comment: string) => void
  clear: () => void
}

const sameModifiers = (left: string[], right: string[]) =>
  left.length === right.length && left.every((modifier) => right.includes(modifier))

export const useCartStore = create<CartState>((set) => ({
  items: [],
  comment: '',
  add: (item) => set((state) => {
    const existing = state.items.find((cartItem) => cartItem.menuItemId === item.menuItemId && sameModifiers(cartItem.selectedModifiers, item.selectedModifiers))
    return existing
      ? { items: state.items.map((cartItem) => cartItem === existing ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem) }
      : { items: [...state.items, { ...item, quantity: 1 }] }
  }),
  setQuantity: (menuItemId, selectedModifiers, quantity) => set((state) => ({
    items: quantity < 1
      ? state.items.filter((item) => item.menuItemId !== menuItemId || !sameModifiers(item.selectedModifiers, selectedModifiers))
      : state.items.map((item) => item.menuItemId === menuItemId && sameModifiers(item.selectedModifiers, selectedModifiers) ? { ...item, quantity } : item),
  })),
  remove: (menuItemId, selectedModifiers) => set((state) => ({ items: state.items.filter((item) => item.menuItemId !== menuItemId || !sameModifiers(item.selectedModifiers, selectedModifiers)) })),
  setComment: (comment) => set({ comment }),
  clear: () => set({ items: [], comment: '' }),
}))
