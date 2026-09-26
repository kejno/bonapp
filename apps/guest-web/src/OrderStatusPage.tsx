import { useCallback, useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { useOrdersStore, type GuestOrder } from './orders/orders.store'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'
const SOCKET_BASE = API_BASE.replace(/\/api\/v1\/?$/, '')

interface OrderStatusPageProps {
  orderId: string
}

export default function OrderStatusPage({ orderId }: OrderStatusPageProps) {
  const storedOrder = useOrdersStore((state) => state.order)
  const order = storedOrder?.id === orderId ? storedOrder : null
  const setOrder = useOrdersStore((state) => state.setOrder)
  const [error, setError] = useState(false)
  const [countdown, setCountdown] = useState('--:--')
  const qrToken = window.sessionStorage.getItem('qrToken')

  const refreshOrder = useCallback(async () => {
    if (!qrToken) {
      setError(true)
      return
    }
    try {
      const response = await fetch(`${API_BASE}/guest/orders/${encodeURIComponent(orderId)}`, {
        headers: { 'X-QR-Token': qrToken },
      })
      if (!response.ok) throw new Error('Unable to load order')
      setOrder(await response.json() as GuestOrder)
      setError(false)
    } catch {
      setError(true)
    }
  }, [orderId, qrToken, setOrder])

  useEffect(() => {
    void refreshOrder()
    if (!qrToken) return
    const socket = io(SOCKET_BASE, { auth: { qrToken }, reconnection: true })
    const joinOrderRoom = () => {
      void refreshOrder().finally(() => socket.emit('join_order_room', { orderId }))
    }
    const onStatusChanged = (update: GuestOrder) => {
      if (update.id === orderId) setOrder(update)
    }
    socket.on('connect', joinOrderRoom)
    socket.on('order:status_changed', onStatusChanged)
    return () => {
      socket.off('connect', joinOrderRoom)
      socket.off('order:status_changed', onStatusChanged)
      socket.disconnect()
    }
  }, [orderId, qrToken, refreshOrder, setOrder])

  useEffect(() => {
    if (!order?.estimatedReadyAt || order.status !== 'COOKING') return
    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((Date.parse(order.estimatedReadyAt!) - Date.now()) / 1000))
      setCountdown(`${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`)
    }
    updateTimer()
    const interval = window.setInterval(updateTimer, 1000)
    return () => window.clearInterval(interval)
  }, [order?.estimatedReadyAt, order?.status])

  const cancelled = order?.status === 'CANCELLED'
  const statusText = cancelled ? 'Заказ отменён'
    : order?.status === 'COOKING' ? 'Готовится на кухне'
      : order?.status === 'READY' ? 'Готово — зовите официанта'
        : order ? 'Новый' : ''
  const menuUrl = `/menu?qr_token=${encodeURIComponent(qrToken ?? '')}&orderId=${encodeURIComponent(orderId)}`

  return <main className="flex min-h-svh justify-center bg-background px-5 py-10 text-on-background">
    <section className="w-full max-w-lg text-center">
      <h1 className="text-2xl font-semibold text-primary">Статус заказа</h1>
      {!order && !error && <p className="mt-8">Загружаем заказ…</p>}
      {error && <p role="alert" className="mt-8">Не удалось загрузить статус заказа</p>}
      {order && <>
        <p className="mt-8 text-sm text-on-background/60">Заказ #{String(order.dailyOrderNumber).padStart(3, '0')}</p>
        <h2 className="mt-3 text-xl font-semibold">{statusText}</h2>
        {cancelled && <p className="mt-3">Обратитесь к официанту</p>}
        {order.status === 'COOKING' && <p className="mt-4">Ориентировочно через <span data-countdown>{countdown}</span></p>}
        {!cancelled && <a className="mt-8 inline-flex rounded-xl bg-primary px-5 py-3 text-white" href={menuUrl}>Добавить ещё</a>}
      </>}
    </section>
  </main>
}
