import { useState } from 'react'
import type { FormEvent } from 'react'
import { useCartStore } from './cart-store'

const formatPrice = (amount: number) => `${amount.toFixed(2)} BYN`

function App() {
  const { items, comment, setComment, setQuantity, remove, clear } = useCartStore()
  const [orderId, setOrderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const total = items.reduce((sum, item) => sum + item.unitPriceByn * item.quantity, 0)
  const qrToken = new URLSearchParams(window.location.search).get('qrToken') ?? ''

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (items.length === 0) return
    setIsSubmitting(true)
    setError(null)
    try {
      const response = await fetch('/api/v1/guest/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrToken, comment, items: items.map(({ menuItemId, quantity, selectedModifiers }) => ({ menuItemId, quantity, selectedModifiers })) }),
      })
      if (!response.ok) throw new Error('Не удалось оформить заказ. Попробуйте ещё раз.')
      const order = await response.json() as { orderId: string }
      clear()
      window.history.pushState({}, '', `/order/${order.orderId}/status`)
      setOrderId(order.orderId)
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Не удалось оформить заказ.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const statusOrderId = orderId ?? window.location.pathname.match(/^\/order\/([^/]+)\/status$/)?.[1]
  if (statusOrderId) return <main className="flex min-h-svh items-center justify-center bg-bonapp-bg"><h1 className="text-2xl font-semibold text-bonapp-accent">Заказ № {statusOrderId} принят</h1></main>

  return (
    <main className="mx-auto min-h-svh max-w-xl bg-bonapp-bg p-6 text-slate-900">
      <h1 className="text-2xl font-semibold text-bonapp-accent">Оформление заказа</h1>
      {items.length === 0 ? <p className="mt-6">Корзина пуста. Вернитесь в меню, чтобы добавить блюда.</p> : <form className="mt-6 space-y-5" onSubmit={submit}>
        <ul className="space-y-3">{items.map((item) => <li className="flex items-center justify-between gap-3" key={`${item.menuItemId}-${item.selectedModifiers.join('-')}`}>
          <span>{item.name} — {formatPrice(item.unitPriceByn)}</span>
          <div className="flex items-center gap-2">
            <button type="button" aria-label={`Уменьшить ${item.name}`} onClick={() => setQuantity(item.menuItemId, item.selectedModifiers, item.quantity - 1)}>−</button>
            <span>{item.quantity}</span>
            <button type="button" aria-label={`Увеличить ${item.name}`} onClick={() => setQuantity(item.menuItemId, item.selectedModifiers, item.quantity + 1)}>+</button>
            <button type="button" aria-label={`Удалить ${item.name}`} onClick={() => remove(item.menuItemId, item.selectedModifiers)}>Удалить</button>
          </div>
        </li>)}</ul>
        <p className="text-lg font-semibold">Итого: {formatPrice(total)}</p>
        <label className="block" htmlFor="comment">Комментарий повару</label>
        <textarea id="comment" className="mt-1 w-full rounded border p-2" maxLength={255} value={comment} onChange={(event) => setComment(event.target.value)} />
        {error && <p role="alert">{error}</p>}
        <button className="rounded bg-bonapp-accent px-4 py-2 text-white disabled:opacity-50" disabled={isSubmitting} type="submit">{isSubmitting ? 'Оформляем…' : 'Оформить заказ'}</button>
      </form>}
    </main>
  )
}

export default App
