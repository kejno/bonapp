import { useEffect, useState } from 'react'
import { getGuestSessionId } from './guest-session'
import { io } from 'socket.io-client'
import OrderStatusPage from './OrderStatusPage'
import CheckoutPage from './CheckoutPage'
import { activateCartForQrToken, useCartStore } from './orders/cart.store'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'

type GuestSession = {
  tenant: { id: string; name: string; currency: string }
  table: { id: string; tableNumber: number; areaName: string }
  activeOrder: { id: string; status: string } | null
}

type GuestMenu = Array<{
  id: string
  name: string
  items: Array<{ id: string; name: string; description: string | null; priceByn: string | number; modifierGroups?: Array<{ sortOrder: number; modifierGroup: { id: string; name: string; isRequired: boolean; minSelection: number; maxSelection: number | null; modifiers: Array<{ id: string; name: string; price: string | number }> } }> }>
}>
type TenantConfig = { logoUrl: string | null; brandColor: string; serviceMode: 'ORDER_AND_PAY' | 'VIEW_ONLY' | 'TAKEAWAY' }

export default function App() {
  if (window.location.pathname === '/order/checkout') {
    const qrToken = new URLSearchParams(window.location.search).get('qr_token') ?? window.sessionStorage.getItem('qrToken') ?? ''
    if (qrToken) activateCartForQrToken(qrToken)
    return <CheckoutPage />
  }
  const statusMatch = window.location.pathname.match(/^\/order\/([^/]+)\/status$/)
  if (statusMatch) return <OrderStatusPage orderId={decodeURIComponent(statusMatch[1])} />
  const qrToken = new URLSearchParams(window.location.search).get('qr_token')
  if (qrToken) activateCartForQrToken(qrToken)
  const orderId = new URLSearchParams(window.location.search).get('orderId')
  const [session, setSession] = useState<GuestSession | null>(null)
  const [menu, setMenu] = useState<GuestMenu>([])
  const [menuLoaded, setMenuLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [menuError, setMenuError] = useState(false)
  const [callModalOpen, setCallModalOpen] = useState(false)
  const [callStatus, setCallStatus] = useState('')
  const [tenantConfig, setTenantConfig] = useState<TenantConfig | null>(null)
  const [orderItemMessage, setOrderItemMessage] = useState('')
  const cart = useCartStore((state) => state.items)
  const addToCart = useCartStore((state) => state.addItem)
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>({})
  const canAddToOrder = Boolean(orderId && session?.activeOrder?.id === orderId && ['NEW', 'COOKING'].includes(session.activeOrder.status))

  async function addToOrder(itemId: string) {
    if (!qrToken || !orderId || !canAddToOrder) return
    try {
      const response = await fetch(`${API_BASE}/guest/orders/${encodeURIComponent(orderId)}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-QR-Token': qrToken },
        body: JSON.stringify({ itemId, quantity: 1 }),
      })
      if (!response.ok) throw new Error('Unable to add item')
      setOrderItemMessage('Позиция добавлена в заказ')
    } catch {
      setOrderItemMessage('Не удалось добавить позицию в заказ')
    }
  }

  async function callWaiter(reason: 'NEED_BILL' | 'CALL_STAFF') {
    if (!qrToken) return
    try {
      const response = await fetch(`${API_BASE}/guest/call-waiter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-QR-Token': qrToken },
        body: JSON.stringify({ tableId: session?.table.id, reason }),
      })
      if (!response.ok) {
        setCallStatus('Не удалось отправить вызов')
        return
      }
      setCallModalOpen(false)
      setCallStatus('Официант уже идёт')
    } catch {
      setCallStatus('Не удалось отправить вызов')
    }
  }

  useEffect(() => {
    if (!qrToken) return

    const controller = new AbortController()
    let sessionResolved = false
    fetch(`${API_BASE}/guest/session/${encodeURIComponent(qrToken)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to resolve table QR token')
        return response.json() as Promise<GuestSession>
      })
      .then(async (resolvedSession) => {
        sessionResolved = true
        window.sessionStorage.setItem('qrToken', qrToken)
        getGuestSessionId()
        setSession(resolvedSession)
        const configResponse = await fetch(
          `${API_BASE}/guest/tenant/config?tenantId=${encodeURIComponent(resolvedSession.tenant.id)}`,
          { signal: controller.signal },
        )
        if (!configResponse.ok) throw new Error('Unable to load tenant config')
        setTenantConfig(await configResponse.json() as TenantConfig)
        const response = await fetch(
          `${API_BASE}/guest/menu?tenantId=${encodeURIComponent(resolvedSession.tenant.id)}`,
          { signal: controller.signal },
        )
        if (!response.ok) throw new Error('Unable to load guest menu')
        setMenu(await response.json() as GuestMenu)
        setMenuLoaded(true)
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === 'AbortError') return
        if (!sessionResolved) setError(true)
        else setMenuError(true)
      })

    return () => controller.abort()
  }, [qrToken])

  useEffect(() => {
    if (!qrToken) return
    const socketOrigin = API_BASE.replace(/\/api\/v1\/?$/, '')
    const socket = io(socketOrigin, { auth: { qrToken }, transports: ['websocket', 'polling'] })
    socket.on('tenant:service_mode_changed', (payload: { serviceMode: TenantConfig['serviceMode'] }) => {
      setTenantConfig((current) => current ? { ...current, serviceMode: payload.serviceMode } : current)
    })
    return () => { socket.disconnect() }
  }, [qrToken])

  return (
    <main className="flex min-h-svh items-center justify-center bg-background" style={{ '--color-primary': tenantConfig?.brandColor ?? '#e0533c' } as React.CSSProperties}>
      <section className="text-center">
        <h1 className="text-2xl font-semibold text-primary">Bonapp — Guest</h1>
        {qrToken && !session && !error && <p>Открываем стол…</p>}
        {session && tenantConfig && <>
          <div className="flex items-center justify-center gap-2">{tenantConfig?.logoUrl && <img src={tenantConfig.logoUrl} alt="Логотип заведения" className="h-10 w-10 object-contain" />}<h2>{session.tenant.name}</h2></div>
          <p>Стол {session.table.tableNumber} · {session.table.areaName}</p>
          <button onClick={() => setCallModalOpen(true)}>Вызвать официанта</button>
          {callStatus && <p role="status">{callStatus}</p>}
          {callModalOpen && <section role="dialog" aria-modal="true" aria-label="Вызвать официанта">
            <h3>Вызвать официанта</h3>
            <button onClick={() => void callWaiter('NEED_BILL')}>Попросить счёт</button>
            <button onClick={() => void callWaiter('CALL_STAFF')}>Позвать официанта</button>
            <button onClick={() => setCallModalOpen(false)}>Закрыть</button>
          </section>}
          {session.activeOrder && <p>Активный заказ: {session.activeOrder.status}</p>}
          {canAddToOrder && <p role="status">Добавление к заказу #{session.activeOrder?.id}</p>}
          {orderItemMessage && <p role="status">{orderItemMessage}</p>}
          {session.activeOrder && <a href={`/order/${encodeURIComponent(session.activeOrder.id)}/status?qr_token=${encodeURIComponent(qrToken ?? '')}`}>Статус заказа</a>}
          {tenantConfig?.serviceMode === 'VIEW_ONLY' && <p>Заказы временно недоступны</p>}
          {tenantConfig?.serviceMode === 'TAKEAWAY' && <p>Доступен самовывоз</p>}
          <section aria-label="Меню">
            <h3>Меню</h3>
            {menuError && <p role="alert">Не удалось загрузить меню</p>}
            {!menuError && !menuLoaded && <p>Загружаем меню…</p>}
            {!menuError && menuLoaded && menu.length === 0 && <p>Меню пока пусто</p>}
            {menu.map((category) => <section key={category.id}>
              <h4>{category.name}</h4>
              <ul>{category.items.map((item) => <li key={item.id}>
                <strong>{item.name}</strong>
                {item.description && <p>{item.description}</p>}
                <span>{item.priceByn} {session.tenant.currency}</span>
                {canAddToOrder && <button onClick={() => void addToOrder(item.id)}>Добавить {item.name}</button>}
                {!canAddToOrder && tenantConfig?.serviceMode !== 'VIEW_ONLY' && <>{item.modifierGroups?.map(({ modifierGroup: group }) => <fieldset key={group.id}><legend>{group.name}{group.isRequired ? ' *' : ''}</legend>{group.modifiers.map((modifier) => <label key={modifier.id} className="mr-3"><input type="checkbox" checked={(selectedModifiers[item.id] ?? []).includes(modifier.id)} onChange={(event) => setSelectedModifiers((current) => { const chosen = current[item.id] ?? []; return { ...current, [item.id]: event.target.checked ? [...chosen, modifier.id] : chosen.filter((id) => id !== modifier.id) } })} /> {modifier.name} (+{modifier.price} BYN)</label>)}</fieldset>)}<button disabled={(item.modifierGroups ?? []).some(({ modifierGroup: group }) => (group.isRequired || group.minSelection > 0) && (selectedModifiers[item.id] ?? []).filter((id) => group.modifiers.some((modifier) => modifier.id === id)).length < Math.max(group.isRequired ? 1 : 0, group.minSelection))} onClick={() => { const chosen = selectedModifiers[item.id] ?? []; const extra = (item.modifierGroups ?? []).flatMap(({ modifierGroup: group }) => group.modifiers).filter((modifier) => chosen.includes(modifier.id)).reduce((sum, modifier) => sum + Number(modifier.price), 0); addToCart({ id: item.id, name: item.name, priceByn: Number(item.priceByn) + extra, quantity: 1, selectedModifiers: chosen }) }}>В корзину: {item.name}</button></>}
              </li>)}</ul>
            </section>)}
          </section>
          {!canAddToOrder && cart.length > 0 && <a href={`/order/checkout?qr_token=${encodeURIComponent(qrToken ?? '')}`}>Оформить заказ ({cart.reduce((sum, item) => sum + item.quantity, 0)})</a>}
        </>}
        {error && <p role="alert">Не удалось открыть стол по QR-коду</p>}
      </section>
    </main>
  )
}
