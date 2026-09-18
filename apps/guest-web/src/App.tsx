import { useEffect, useState } from 'react'
import type { OrderStatus } from '@bonapp/shared-types'
import { getOrder } from './orderApi'
import { useOrdersStore } from './ordersStore'
import { connectOrderSocket } from './orderSocket'

const statusLabels: Record<OrderStatus, string> = {
  NEW: 'Новый',
  PREPARING: 'Готовится на кухне',
  READY: 'Готово — зовите официанта',
  CANCELLED: 'Заказ отменён',
}

function getOrderId() {
  return window.location.pathname.match(/^\/order\/([^/]+)\/status$/)?.[1]
}

function remainingTime(estimatedReadyAt: string | null, now: number) {
  if (!estimatedReadyAt) return null
  const seconds = Math.max(0, Math.ceil((new Date(estimatedReadyAt).getTime() - now) / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function App() {
  const orderId = getOrderId()
  const order = useOrdersStore((state) => (orderId ? state.orders[orderId] : undefined))
  const save = useOrdersStore((state) => state.save)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (!orderId) return
    let active = true
    const loadOrder = async () => {
      try {
        const snapshot = await getOrder(orderId)
        if (active) {
          setNow(Date.now())
          save(snapshot)
          setError(null)
        }
      } catch {
        if (active) setError('Не удалось загрузить заказ')
      }
    }

    void loadOrder()
    const socket = connectOrderSocket(
      orderId,
      (snapshot) => {
        setNow(Date.now())
        save(snapshot)
      },
      () => void loadOrder(),
    )
    return () => {
      active = false
      socket.disconnect()
    }
  }, [orderId, save])

  useEffect(() => {
    if (order?.status !== 'PREPARING') return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [order?.status])

  if (!orderId) {
    return <main className="flex min-h-svh items-center justify-center bg-bonapp-bg">Некорректная ссылка на заказ</main>
  }

  if (error) {
    return <main className="flex min-h-svh items-center justify-center bg-bonapp-bg">{error}</main>
  }

  if (!order) {
    return <main className="flex min-h-svh items-center justify-center bg-bonapp-bg">Загрузка заказа…</main>
  }

  const timer = order.status === 'PREPARING' ? remainingTime(order.estimatedReadyAt, now) : null

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-bonapp-bg px-6 text-center text-stone-900">
      <header className="text-lg font-semibold text-bonapp-accent">#{String(order.dailyOrderNumber).padStart(3, '0')}</header>
      <section aria-live="polite">
        <h1 className="text-3xl font-semibold">{statusLabels[order.status]}</h1>
        {order.status === 'CANCELLED' ? <p className="mt-3">Обратитесь к официанту</p> : null}
        {timer ? <p className="mt-3 text-5xl tabular-nums" aria-label="Осталось времени">{timer}</p> : null}
      </section>
      {order.status !== 'CANCELLED' ? <a className="rounded-full bg-bonapp-accent px-6 py-3 font-semibold text-white" href={`/menu?orderId=${encodeURIComponent(orderId)}`}>Добавить ещё</a> : null}
    </main>
  )
}

export default App
