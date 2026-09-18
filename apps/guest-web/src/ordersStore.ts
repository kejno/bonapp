import type { OrderSnapshot } from '@bonapp/shared-types'
import { create } from 'zustand'

interface OrdersState {
  orders: Record<string, OrderSnapshot>
  save: (order: OrderSnapshot) => void
}

export const useOrdersStore = create<OrdersState>((set) => ({
  orders: {},
  save: (order) =>
    set((state) => ({ orders: { ...state.orders, [order.orderId]: order } })),
}))
