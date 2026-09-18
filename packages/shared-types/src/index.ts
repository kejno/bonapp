export const WaiterCallReason = {
  NEED_BILL: 'NEED_BILL',
  CALL_STAFF: 'CALL_STAFF',
} as const

export type WaiterCallReason = (typeof WaiterCallReason)[keyof typeof WaiterCallReason]

export interface WaiterCalledEvent {
  tableId: string
  tableNumber: number
  reason: WaiterCallReason
}
