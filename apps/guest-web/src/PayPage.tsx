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
  const [cardEnabled, setCardEnabled] = useState(false)
  const [paying, setPaying] = useState(false)
  const [paymentMessage, setPaymentMessage] = useState('')

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
      const paymentResponse = await fetch(`${API_BASE}/guest/orders/${encodeURIComponent(orderId)}/pay/card/status`, { headers: { 'X-QR-Token': qrToken }, signal: controller.signal })
      if (paymentResponse.ok) {
        const payment = await paymentResponse.json() as { paymentEnabled?: boolean }
        setCardEnabled(payment.paymentEnabled === true)
      }
    }).catch((requestError: unknown) => {
      if (requestError instanceof Error && requestError.name === 'AbortError') return
      setError(true)
    })
    return () => controller.abort()
  }, [orderId, qrToken])

  useEffect(() => {
    if (!qrToken || !new URLSearchParams(window.location.search).has('result')) return
    let active = true
    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE}/guest/orders/${encodeURIComponent(orderId)}/pay/card/status`, { headers: { 'X-QR-Token': qrToken } })
        if (!response.ok) throw new Error()
        const result = await response.json() as { paymentStatus: string | null; orderStatus: string }
        if (!active) return
        if (result.paymentStatus === 'SUCCEEDED' || result.orderStatus === 'PAID') setPaymentMessage('Спасибо! Приходите снова')
        else if (result.paymentStatus === 'FAILED' || result.paymentStatus === 'CANCELLED') setPaymentMessage('Оплата не завершена. Попробуйте ещё раз или выберите другой способ.')
        else window.setTimeout(poll, 2000)
      } catch { if (active) setPaymentMessage('Не удалось проверить статус оплаты') }
    }
    void poll()
    return () => { active = false }
  }, [orderId, qrToken])

  async function payByCard() {
    if (!qrToken) return
    setPaying(true)
    setPaymentMessage('')
    try {
      const response = await fetch(`${API_BASE}/guest/orders/${encodeURIComponent(orderId)}/pay/card`, {
        method: 'POST', headers: { 'X-QR-Token': qrToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipsAmountByn: 0 }),
      })
      const result = await response.json() as { redirectUrl?: string }
      if (!response.ok || !result.redirectUrl) throw new Error()
      window.location.assign(result.redirectUrl)
    } catch { setPaymentMessage('Не удалось начать оплату. Попробуйте ещё раз.') }
    finally { setPaying(false) }
  }

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
    {paymentMessage && <p role="status" className="mt-6">{paymentMessage}</p>}
    {orderTotal === null && !error && <p className="mt-6">Загружаем заказ…</p>}
    {orderTotal !== null && <section className="mt-6 space-y-4">
      {cardEnabled && <div role="tablist" aria-label="Способ оплаты"><button type="button" role="tab" aria-selected="true">Карта</button></div>}
      <p>Сумма заказа: {money(orderTotal)} BYN</p>
      <fieldset>
        <legend>Чаевые</legend>
        <div className="mt-2 flex gap-2">{[0, 5, 10, 15].map((percent) => <button key={percent} type="button" aria-pressed={customTip === money(orderTotal * percent / 100)} onClick={() => selectPercent(percent)} className="rounded-lg border px-3 py-2">{percent}%</button>)}</div>
        <label className="mt-4 block">Своя сумма чаевых<input aria-label="Своя сумма чаевых" type="number" min="0" step="0.01" value={customTip} onChange={(event) => updateCustomTip(event.target.value)} className="mt-2 w-full rounded-xl border p-3" /></label>
      </fieldset>
      <p>Чаевые: {money(tipAmount)} BYN</p>
      <p>Итого: {money(orderTotal + tipAmount)} BYN</p>
      {cardEnabled && <button type="button" disabled={paying} onClick={() => void payByCard()} className="w-full rounded-xl bg-primary px-4 py-3 text-white">{paying ? 'Переходим к оплате…' : 'Оплатить картой'}</button>}
    </section>}
  </main>
}
