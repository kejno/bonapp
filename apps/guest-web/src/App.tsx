import { useEffect, useMemo, useState } from 'react'
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

type Modifier = { id: string; name: string; price: string | number }
type ModifierGroup = { modifierGroup: { id: string; name: string; isRequired: boolean; minSelection: number; maxSelection: number | null; modifiers: Modifier[] } }
type MenuItem = { id: string; name: string; description: string | null; priceByn: string | number; imageUrl?: string | null; weightGrams?: number | null; calories?: number | null; proteins?: number | string | null; fats?: number | string | null; carbs?: number | string | null; allergens?: string[]; modifierGroups?: ModifierGroup[] }
type GuestMenu = Array<{ id: string; name: string; items: MenuItem[] }>
const allergenLabels: Record<string, string> = { GLUTEN: 'Глютен', CRUSTACEANS: 'Ракообразные', EGGS: 'Яйца', FISH: 'Рыба', PEANUTS: 'Арахис', SOYBEANS: 'Соя', MILK: 'Молоко', NUTS: 'Орехи', CELERY: 'Сельдерей', MUSTARD: 'Горчица', SESAME: 'Кунжут', SULPHITES: 'Сульфиты', LUPIN: 'Люпин', MOLLUSCS: 'Моллюски' }
const money = (value: number, currency: string) => `${value.toFixed(2)} ${currency}`
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
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [validationError, setValidationError] = useState(false)
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const groups = selectedItem?.modifierGroups?.map(({ modifierGroup }) => modifierGroup) ?? []
  const chosenModifiers = useMemo(() => groups.flatMap((group) => group.modifiers.filter((modifier) => selected[group.id]?.includes(modifier.id))), [groups, selected])
  const unitPrice = selectedItem ? Number(selectedItem.priceByn) + chosenModifiers.reduce((sum, modifier) => sum + Number(modifier.price), 0) : 0
  const openDish = (item: MenuItem) => { setSelectedItem(item); setQuantity(1); setSelected({}); setValidationError(false) }
  const toggleModifier = (group: typeof groups[number], modifier: Modifier) => {
    setSelected((current) => {
      const chosen = current[group.id] ?? []
      if (chosen.includes(modifier.id)) return { ...current, [group.id]: chosen.filter((id) => id !== modifier.id) }
      if (group.isRequired || group.maxSelection === 1) return { ...current, [group.id]: [modifier.id] }
      if (group.maxSelection !== null && chosen.length >= group.maxSelection) return current
      return { ...current, [group.id]: [...chosen, modifier.id] }
    })
    setValidationError(false)
  }
  const submitDish = () => {
    if (!selectedItem || groups.some((group) => group.isRequired && !selected[group.id]?.length)) { setValidationError(true); return }
    addToCart({ id: selectedItem.id, name: selectedItem.name, quantity, priceByn: unitPrice, selectedModifiers: chosenModifiers.map((modifier) => modifier.id) })
    setSelectedItem(null)
  }
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
      <section className="w-full max-w-2xl px-4 text-center">
        <header className="flex items-center justify-between"><h1 className="text-2xl font-semibold text-primary">Bonapp</h1><span aria-label="Количество товаров в корзине">Корзина · {cartCount}</span></header>
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
              <ul>{category.items.map((item) => <li key={item.id}><button type="button" onClick={() => openDish(item)} className="text-left">
                <strong>{item.name}</strong>
                {item.description && <p>{item.description}</p>}
                <span>{money(Number(item.priceByn), session.tenant.currency)}</span></button>
                {canAddToOrder && <button onClick={() => void addToOrder(item.id)}>Добавить {item.name}</button>}
                {!canAddToOrder && tenantConfig?.serviceMode !== 'VIEW_ONLY' && <button type="button" onClick={() => openDish(item)}>Выбрать · {item.name}</button>}
              </li>)}</ul>
            </section>)}
          </section>
          {!canAddToOrder && cart.length > 0 && <a href={`/order/checkout?qr_token=${encodeURIComponent(qrToken ?? '')}`}>Оформить заказ ({cart.reduce((sum, item) => sum + item.quantity, 0)})</a>}
        </>}
        {error && <p role="alert">Не удалось открыть стол по QR-коду</p>}
      </section>
      {selectedItem && session && <div className="fixed inset-0 z-20 flex items-end bg-black/50" onClick={() => setSelectedItem(null)}>
        <section role="dialog" aria-modal="true" aria-labelledby="dish-title" onClick={(event) => event.stopPropagation()} className="max-h-[92svh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 pb-7 text-left shadow-xl">
          {selectedItem.imageUrl && <img src={selectedItem.imageUrl} alt={selectedItem.name} className="mb-4 h-52 w-full rounded-xl object-cover" />}
          <h2 id="dish-title" className="text-2xl font-semibold">{selectedItem.name}</h2>
          {selectedItem.description && <p className="mt-2">{selectedItem.description}</p>}
          {(selectedItem.weightGrams != null || selectedItem.calories != null) && <p className="mt-3 text-sm">{selectedItem.weightGrams != null && `${selectedItem.weightGrams} г`}{selectedItem.calories != null && ` · ${selectedItem.calories} ккал`}{selectedItem.proteins != null && ` · Б ${selectedItem.proteins} г`}{selectedItem.fats != null && ` · Ж ${selectedItem.fats} г`}{selectedItem.carbs != null && ` · У ${selectedItem.carbs} г`}</p>}
          {!!selectedItem.allergens?.length && <div className="mt-3 flex flex-wrap gap-2">{selectedItem.allergens.map((allergen) => <span key={allergen} className="rounded-full bg-surface-container-high px-3 py-1 text-xs">{allergenLabels[allergen] ?? allergen}</span>)}</div>}
          <div className="mt-5 space-y-4">{groups.map((group) => <fieldset key={group.id}><legend className="mb-2 font-semibold">{group.name}<span className="ml-2 text-sm font-normal">{group.isRequired ? 'Выберите 1' : `До ${group.maxSelection ?? 'любого количества'}`}</span></legend>{group.modifiers.map((modifier) => { const radio = group.isRequired || group.maxSelection === 1; return <label key={modifier.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3"><input type={radio ? 'radio' : 'checkbox'} name={`modifier-${group.id}`} checked={selected[group.id]?.includes(modifier.id) ?? false} onChange={() => toggleModifier(group, modifier)} /><span className="flex-1">{modifier.name}</span>{Number(modifier.price) !== 0 && <span>+{money(Number(modifier.price), session.tenant.currency)}</span>}</label> })}</fieldset>)}</div>
          {validationError && <p role="alert" className="mt-3 text-error">Выберите обязательные модификаторы</p>}
          <div className="mt-5 flex items-center justify-between"><div className="flex items-center gap-4"><button aria-label="Уменьшить количество" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><span>{quantity}</span><button aria-label="Увеличить количество" onClick={() => setQuantity((value) => value + 1)}>+</button></div><button onClick={submitDish}>Добавить в заказ · {money(unitPrice * quantity, session.tenant.currency)}</button></div>
        </section>
      </div>}
    </main>
  )
}
