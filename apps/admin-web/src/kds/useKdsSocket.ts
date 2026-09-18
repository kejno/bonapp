import { Howl } from 'howler'
import { io } from 'socket.io-client'
import { useEffect } from 'react'
import type { KdsOrder } from './types'

const orderCreatedSound = new Howl({
  src: ['data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAAAAAAAAAAAAAAAAAAAA'],
  volume: 0.35,
})

interface KdsSocketHandlers {
  onCreated: (order: KdsOrder) => void
  onUpdated: (order: KdsOrder) => void
}

export function useKdsSocket({ onCreated, onUpdated }: KdsSocketHandlers) {
  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL ?? undefined, {
      path: import.meta.env.VITE_SOCKET_PATH ?? '/socket.io',
    })

    socket.emit('join', 'tenant_kitchen')
    socket.on('order:created', (order: KdsOrder) => {
      orderCreatedSound.play()
      onCreated(order)
    })
    socket.on('order:updated', onUpdated)

    return () => {
      socket.disconnect()
    }
  }, [onCreated, onUpdated])
}
