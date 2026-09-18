import { create } from 'zustand'

type CartState = {
  itemCount: number
  setItemCount: (itemCount: number) => void
}

export const useCartStore = create<CartState>((set) => ({
  itemCount: 0,
  setItemCount: (itemCount) => set({ itemCount }),
}))
