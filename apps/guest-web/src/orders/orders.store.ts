import { create } from 'zustand'

export interface GuestOrder {
  id: string
  dailyOrderNumber: number
  status: string
  updatedAt: string
  estimatedReadyAt: string | null
}

interface OrdersState {
  order: GuestOrder | null
  setOrder: (order: GuestOrder) => void
}

export const useOrdersStore = create<OrdersState>((set) => ({
  order: null,
  setOrder: (order) => set((state) => {
    if (state.order?.id === order.id && Date.parse(order.updatedAt) < Date.parse(state.order.updatedAt)) {
      return state
    }
    return { order }
  }),
}))
