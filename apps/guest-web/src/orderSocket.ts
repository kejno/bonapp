import type { OrderStatusChanged } from '@bonapp/shared-types'
import { io, type Socket } from 'socket.io-client'

export function connectOrderSocket(
  orderId: string,
  onStatusChanged: (order: OrderStatusChanged) => void,
  onReconnect: () => void,
): Socket {
  const socket = io({ autoConnect: false, reconnection: true })

  socket.on('connect', () => {
    socket.emit('join_order_room', { orderId })
    onReconnect()
  })
  socket.on('order:status_changed', onStatusChanged)
  socket.connect()

  return socket
}
