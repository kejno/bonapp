import { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'

interface PayPageProps {
  orderId: string
}

interface GuestOrderPaymentSnapshot {
  id: string
  totalAmountByn: string | number
}

const money = (amount: number) => amount.toFixed(2)

export default function PayPage({ orderId }: PayPageProps) {
  const qrToken = window.sessionStorage.getItem('qrToken')
    ?? new URLSearchParams(window.location.search).get('qr_token')
  const [orderTotal, setOrderTotal] = useState<number | null>(null)
  const [tipAmount, setTipAmount] = useState(0)
  const [customTip, setCustomTip] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!qrToken) {
      setError(true)
      return
    }
    const controller = new AbortController()
    fetch(`${API_BASE}/guest/orders/${encodeURIComponent(orderId)}`, {
      headers: { 'X-QR-Token': qrToken },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('Unable to load order')
      const order = await response.json() as GuestOrderPaymentSnapshot
      if (order.id !== orderId || !Number.isFinite(Number(order.totalAmountByn)) || Number(order.totalAmountByn) < 0) {
        throw new Error('Invalid order total')
      }
      setOrderTotal(Number(order.totalAmountByn))
    }).catch((requestError: unknown) => {
      if (requestError instanceof Error && requestError.name === 'AbortError') return
      setError(true)
    })
    return () => controller.abort()
  }, [orderId, qrToken])

  function selectPercent(percent: number) {
    const amount = orderTotal === null ? 0 : Math.round(orderTotal * percent) / 100
    setTipAmount(amount)
    setCustomTip(money(amount))
  }

  function updateCustomTip(value: string) {
    setCustomTip(value)
    const amount = Number(value)
    setTipAmount(value.trim() !== '' && Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : 0)
  }

  return <main className="mx-auto min-h-svh w-full max-w-lg bg-background px-5 py-8 text-on-background">
    <h1 className="text-2xl font-semibold">Оплата заказа</h1>
    {error && <p role="alert" className="mt-6">Не удалось загрузить заказ</p>}
    {orderTotal === null && !error && <p className="mt-6">Загружаем заказ…</p>}
    {orderTotal !== null && <section className="mt-6 space-y-4">
      <p>Сумма заказа: {money(orderTotal)} BYN</p>
      <fieldset>
        <legend>Чаевые</legend>
        <div className="mt-2 flex gap-2">{[0, 5, 10, 15].map((percent) => <button key={percent} type="button" aria-pressed={customTip === money(orderTotal * percent / 100)} onClick={() => selectPercent(percent)} className="rounded-lg border px-3 py-2">{percent}%</button>)}</div>
        <label className="mt-4 block">Своя сумма чаевых<input aria-label="Своя сумма чаевых" type="number" min="0" step="0.01" value={customTip} onChange={(event) => updateCustomTip(event.target.value)} className="mt-2 w-full rounded-xl border p-3" /></label>
      </fieldset>
      <p>Чаевые: {money(tipAmount)} BYN</p>
      <p>Итого: {money(orderTotal + tipAmount)} BYN</p>
    </section>}
  </main>
}
