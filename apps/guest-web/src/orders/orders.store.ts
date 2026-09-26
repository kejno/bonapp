import { create } from 'zustand'

export interface GuestOrder {
  id: string
  dailyOrderNumber: number
  status: string
  estimatedReadyAt: string | null
}

interface OrdersState {
  order: GuestOrder | null
  setOrder: (order: GuestOrder) => void
}

export const useOrdersStore = create<OrdersState>((set) => ({
  order: null,
  setOrder: (order) => set({ order }),
}))
