import { useCallback, useEffect, useState } from 'react'
import type { DragEvent } from 'react'
import { updateKdsOrderStatus } from './api'
import { nextKdsStatus, type KdsOrder, type KdsStatus, type Kitchen, type KitchenFilter } from './types'
import { useKdsSocket } from './useKdsSocket'

const columns: Array<{ status: KdsStatus; label: string; accent: string }> = [
  { status: 'new', label: 'Новые', accent: 'bg-amber-400' },
  { status: 'preparing', label: 'Готовятся', accent: 'bg-blue-500' },
  { status: 'served', label: 'Поданы', accent: 'bg-emerald-500' },
  { status: 'paid', label: 'Оплачены', accent: 'bg-slate-400' },
]

const filters: Array<{ value: KitchenFilter; label: string }> = [
  { value: 'all', label: 'Всё' },
  { value: 'hot', label: 'Горячий цех' },
  { value: 'cold', label: 'Холодный цех' },
  { value: 'bar', label: 'Бар' },
]

const kitchenLabels: Record<Kitchen, string> = {
  hot: 'Горячий цех',
  cold: 'Холодный цех',
  bar: 'Бар',
}

interface KdsBoardProps {
  initialOrders?: KdsOrder[]
  updateOrderStatus?: (orderId: string, status: KdsStatus, kitchen?: Kitchen) => Promise<void>
}

export function KdsBoard({ initialOrders, updateOrderStatus = updateKdsOrderStatus }: KdsBoardProps) {
  const [orders, setOrders] = useState<KdsOrder[]>(initialOrders ?? [])
  const [filter, setFilter] = useState<KitchenFilter>('all')
  const [error, setError] = useState<string>()
  const [now, setNow] = useState(0)

  useEffect(() => {
    const updateNow = () => setNow(Date.now())
    updateNow()
    const interval = window.setInterval(updateNow, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  const replaceOrder = useCallback((order: KdsOrder) => {
    setOrders((current) => {
      const index = current.findIndex(({ id }) => id === order.id)
      return index === -1 ? [order, ...current] : current.map((item) => item.id === order.id ? order : item)
    })
  }, [])

  const addOrder = useCallback((order: KdsOrder) => {
    setOrders((current) => current.some(({ id }) => id === order.id) ? current : [order, ...current])
  }, [])

  useKdsSocket({ onCreated: addOrder, onUpdated: replaceOrder })

  const moveOrder = async (order: KdsOrder, status: KdsStatus) => {
    if (status === order.status) return
    setError(undefined)
    const previousStatus = order.status
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status } : item))
    try {
      await updateOrderStatus(order.id, status, filter === 'all' ? undefined : filter)
    } catch {
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: previousStatus } : item))
      setError('Не удалось обновить статус. Повторите попытку.')
    }
  }

  const handleDrop = (event: DragEvent<HTMLElement>, status: KdsStatus) => {
    event.preventDefault()
    const order = orders.find(({ id }) => id === event.dataTransfer.getData('text/plain'))
    if (order) void moveOrder(order, status)
  }

  return (
    <main className="min-h-svh bg-bonapp-bg p-6 text-slate-900">
      <header className="mx-auto mb-6 flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-bonapp-accent">Live KDS</p>
          <h1 className="text-3xl font-semibold">Заказы кухни</h1>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Фильтр по цеху">
          {filters.map(({ value, label }) => (
            <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-xl px-4 py-2 text-sm font-medium ${filter === value ? 'bg-bonapp-accent text-white' : 'bg-white text-slate-600 shadow-sm'}`}>
              {label}
            </button>
          ))}
        </div>
      </header>
      {error && <p role="alert" className="mx-auto mb-4 max-w-[1600px] rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <section className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 lg:grid-cols-4" aria-label="Канбан заказов">
        {columns.map((column) => (
          <section key={column.status} data-testid={`kds-column-${column.status}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, column.status)} className="min-h-72 rounded-2xl bg-slate-100 p-3">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><span className={`h-3 w-3 rounded-full ${column.accent}`} />{column.label}</h2>
            <div className="space-y-3">
              {orders.filter((order) => order.status === column.status && (filter === 'all' || order.items.some((item) => item.kitchen === filter))).map((order) => (
                <OrderCard key={order.id} order={order} filter={filter} now={now} onMove={moveOrder} />
              ))}
            </div>
          </section>
        ))}
      </section>
    </main>
  )
}

interface OrderCardProps {
  order: KdsOrder
  filter: KitchenFilter
  now: number
  onMove: (order: KdsOrder, status: KdsStatus) => Promise<void>
}

function OrderCard({ order, filter, now, onMove }: OrderCardProps) {
  const nextStatus = nextKdsStatus(order.status)
  const items = filter === 'all' ? order.items : order.items.filter((item) => item.kitchen === filter)
  const waitingMinutes = Math.max(0, Math.floor((now - Date.parse(order.createdAt)) / 60_000))

  return (
    <article draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', order.id)} className="overflow-hidden rounded-xl bg-white shadow-sm" aria-label={`Заказ #${order.number}`}>
      <div className="h-1 bg-bonapp-accent" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2"><strong className="text-xl">#{order.number}</strong><time className="font-mono text-sm text-slate-500">{waitingMinutes} мин</time></div>
        <p className="mt-1 text-sm text-slate-600">Стол {order.table} · {order.waiter}</p>
        <ul className="mt-3 space-y-1 text-sm">
          {items.map((item) => <li key={item.id} className="flex justify-between gap-2"><span>{item.name} ×{item.quantity}</span><span className="text-slate-400">{kitchenLabels[item.kitchen]}</span></li>)}
        </ul>
      </div>
      {nextStatus && <button type="button" onClick={() => void onMove(order, nextStatus)} aria-label={`Bump заказ #${order.number}`} className="w-full border-t border-slate-100 px-4 py-3 text-sm font-semibold text-bonapp-accent hover:bg-orange-50">Bump</button>}
    </article>
  )
}
