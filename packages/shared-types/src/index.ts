export const orderStatuses = ['NEW', 'PREPARING', 'READY', 'CANCELLED'] as const

export type OrderStatus = (typeof orderStatuses)[number]

export interface OrderSnapshot {
  orderId: string
  dailyOrderNumber: number
  status: OrderStatus
  estimatedReadyAt: string | null
}

export interface OrderStatusChanged extends OrderSnapshot {}
