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
  const [error, setError] = useState(false)
  const [cardEnabled, setCardEnabled] = useState(false)
  const [paying, setPaying] = useState(false)
  const [paymentMessage, setPaymentMessage] = useState('')
  const [paymentExpired, setPaymentExpired] = useState(false)

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
    let expiresAt: number | undefined
    let pollTimeout: number | undefined
    const markExpired = () => {
      if (!active) return
      setPaymentExpired(true)
      setPaymentMessage('Время оплаты истекло')
    }
    let expiryTimeout: number | undefined = window.setTimeout(markExpired, 15 * 60_000)
    const poll = async () => {
      if (!active) return
      if (expiresAt !== undefined && Date.now() >= expiresAt) {
        setPaymentExpired(true)
        setPaymentMessage('Время оплаты истекло')
        return
      }
      try {
        const response = await fetch(`${API_BASE}/guest/orders/${encodeURIComponent(orderId)}/pay/card/status`, { headers: { 'X-QR-Token': qrToken } })
        if (!response.ok) throw new Error()
        const result = await response.json() as { paymentStatus: string | null; orderStatus: string; paymentExpiresAt?: string | null }
        if (!active) return
        if (expiresAt === undefined) {
          const serverExpiry = result.paymentExpiresAt ? Date.parse(result.paymentExpiresAt) : Number.NaN
          expiresAt = Number.isFinite(serverExpiry) ? serverExpiry : Date.now() + 15 * 60_000
          if (expiresAt <= Date.now()) {
            markExpired()
            return
          }
          window.clearTimeout(expiryTimeout)
          expiryTimeout = window.setTimeout(markExpired, expiresAt - Date.now())
        }
        if (result.paymentStatus === 'SUCCEEDED' || result.orderStatus === 'PAID') setPaymentMessage('Спасибо! Приходите снова')
        else if (result.paymentStatus === 'FAILED' || result.paymentStatus === 'CANCELLED') setPaymentMessage('Оплата не завершена. Попробуйте ещё раз или выберите другой способ.')
        else pollTimeout = window.setTimeout(poll, Math.min(2000, expiresAt - Date.now()))
      } catch { if (active) setPaymentMessage('Не удалось проверить статус оплаты') }
    }
    void poll()
    return () => {
      active = false
      if (expiryTimeout !== undefined) window.clearTimeout(expiryTimeout)
      if (pollTimeout !== undefined) window.clearTimeout(pollTimeout)
    }
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

  return <main className="mx-auto min-h-svh w-full max-w-lg bg-background px-5 py-8 text-on-background">
    <h1 className="text-2xl font-semibold">Оплата заказа</h1>
    {error && <p role="alert" className="mt-6">Не удалось загрузить заказ</p>}
    {paymentMessage && <p role="status" className="mt-6">{paymentMessage}</p>}
    {orderTotal === null && !error && <p className="mt-6">Загружаем заказ…</p>}
    {orderTotal !== null && <section className="mt-6 space-y-4">
      {cardEnabled && <div role="tablist" aria-label="Способ оплаты"><button type="button" role="tab" aria-selected="true">Карта</button></div>}
      <p>Сумма заказа: {money(orderTotal)} BYN</p>
      <p>К оплате: {money(orderTotal)} BYN</p>
      {cardEnabled && !paymentExpired && <button type="button" disabled={paying} onClick={() => void payByCard()} className="w-full rounded-xl bg-primary px-4 py-3 text-white">{paying ? 'Переходим к оплате…' : 'Оплатить картой'}</button>}
      {paymentExpired && <button type="button" disabled={paying} onClick={() => { setPaymentExpired(false); void payByCard() }} className="w-full rounded-xl bg-primary px-4 py-3 text-white">Повторить оплату</button>}
    </section>}
  </main>
}
