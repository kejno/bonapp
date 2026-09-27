import { useState } from 'react'
import { createGuestOrder } from './guest-session'
import { useCartStore } from './orders/cart.store'
import { useOrdersStore } from './orders/orders.store'

interface CreatedOrder {
  orderId: string
  dailyOrderNumber: number
  status: string
  totalAmountByn: string | number
  estimatedReadyTime: string | null
}

export default function CheckoutPage() {
  const items = useCartStore((state) => state.items)
  const comment = useCartStore((state) => state.comment)
  const setQuantity = useCartStore((state) => state.setQuantity)
  const removeItem = useCartStore((state) => state.removeItem)
  const setComment = useCartStore((state) => state.setComment)
  const clear = useCartStore((state) => state.clear)
  const setOrder = useOrdersStore((state) => state.setOrder)
  const qrToken = new URLSearchParams(window.location.search).get('qr_token') ?? window.sessionStorage.getItem('qrToken') ?? ''
  const total = items.reduce((sum, item) => sum + item.priceByn * item.quantity, 0)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submitOrder() {
    if (!items.length || !qrToken || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const created = await createGuestOrder(qrToken, {
        items: items.map(({ id, quantity, selectedModifiers }) => ({ menuItemId: id, quantity, selectedModifiers })),
        comment,
      }) as CreatedOrder
      clear()
      setOrder({ id: created.orderId, dailyOrderNumber: created.dailyOrderNumber, status: created.status, updatedAt: new Date().toISOString(), estimatedReadyAt: created.estimatedReadyTime })
      window.location.assign(`/order/${encodeURIComponent(created.orderId)}/status?qr_token=${encodeURIComponent(qrToken)}`)
    } catch {
      setError('Не удалось оформить заказ. Проверьте корзину и попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="mx-auto min-h-svh w-full max-w-lg bg-background px-5 py-8 text-on-background">
    <a href={`/?qr_token=${encodeURIComponent(qrToken)}`}>← Вернуться в меню</a>
    <h1 className="mt-6 text-2xl font-semibold">Оформление заказа</h1>
    {!items.length && <p className="mt-6">Корзина пуста</p>}
    <ul className="mt-4 space-y-4">{items.map((item) => <li key={item.lineId} className="flex items-center justify-between gap-3">
      <span>{item.name} · {(item.priceByn * item.quantity).toFixed(2)} BYN</span>
      <div className="flex items-center gap-2"><button aria-label={`Уменьшить количество ${item.name}`} onClick={() => setQuantity(item.lineId, item.quantity - 1)}>−</button><span>{item.quantity}</span><button aria-label={`Увеличить количество ${item.name}`} disabled={item.quantity >= 20} onClick={() => setQuantity(item.lineId, item.quantity + 1)}>+</button><button onClick={() => removeItem(item.lineId)}>Удалить</button></div>
    </li>)}</ul>
    <label className="mt-6 block">Комментарий повару<textarea maxLength={255} value={comment} onChange={(event) => setComment(event.target.value)} className="mt-2 w-full rounded-xl border p-3" /></label>
    <p className="mt-4">Итого: {total.toFixed(2)} BYN</p>
    {error && <p role="alert">{error}</p>}
    <button className="mt-5 rounded-xl bg-primary px-5 py-3 text-white disabled:opacity-50" disabled={!items.length || !qrToken || submitting} onClick={() => void submitOrder()}>{submitting ? 'Оформляем…' : 'Подтвердить заказ'}</button>
  </main>
}
