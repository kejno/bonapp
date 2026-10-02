import { useEffect, useMemo, useState } from 'react'
import { getGuestSessionId } from './guest-session'
import { io } from 'socket.io-client'
import OrderStatusPage from './OrderStatusPage'
import PayPage from './PayPage'
import CheckoutPage from './CheckoutPage'
import { activateCartForQrToken, useCartStore } from './orders/cart.store'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'

type GuestSession = {
  tenant: { id: string; name: string; currency: string }
  table: { id: string; tableNumber: number; areaName: string }
  activeOrder: { id: string; status: string } | null
  tableSessionToken: string
}

type Modifier = { id: string; name: string; price: string | number }
type ModifierGroup = { modifierGroup: { id: string; name: string; isRequired: boolean; minSelection: number; maxSelection: number | null; modifiers: Modifier[] } }
type MenuItem = { id: string; name: string; description: string | null; priceByn: string | number; imageUrl?: string | null; isHit?: boolean; isInStopList?: boolean; weightGrams?: number | null; calories?: number | null; proteins?: number | string | null; fats?: number | string | null; carbs?: number | string | null; allergens?: string[]; modifierGroups?: ModifierGroup[] }
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
  const payMatch = window.location.pathname.match(/^\/order\/([^/]+)\/pay$/)
  if (payMatch) return <PayPage orderId={decodeURIComponent(payMatch[1])} />
  const tableRouteMatch = window.location.pathname.match(/^\/t\/([^/]+)\/?$/)
  let routeQrToken: string | null = null
  let invalidRouteQrToken = false
  if (tableRouteMatch) {
    try {
      routeQrToken = decodeURIComponent(tableRouteMatch[1])
    } catch {
      invalidRouteQrToken = true
    }
  }
  const queryQrToken = new URLSearchParams(window.location.search).get('qr_token')
  const qrToken = queryQrToken ?? routeQrToken
  if (qrToken) activateCartForQrToken(qrToken)
  const orderId = new URLSearchParams(window.location.search).get('orderId')
  const [session, setSession] = useState<GuestSession | null>(null)
  const [menu, setMenu] = useState<GuestMenu>([])
  const [menuSearch, setMenuSearch] = useState('')
  const [menuLoaded, setMenuLoaded] = useState(false)
  const [error, setError] = useState(invalidRouteQrToken && !queryQrToken)
  const [tenantBlocked, setTenantBlocked] = useState(false)
  const [menuError, setMenuError] = useState(false)
  const [callModalOpen, setCallModalOpen] = useState(false)
  const [callStatus, setCallStatus] = useState('')
  const [tenantConfig, setTenantConfig] = useState<TenantConfig | null>(null)
  const [orderItemMessage, setOrderItemMessage] = useState('')
  const [paymentMessage, setPaymentMessage] = useState('')
  const cart = useCartStore((state) => state.items)
  const addToCart = useCartStore((state) => state.addItem)
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [validationError, setValidationError] = useState(false)
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const normalizedSearch = menuSearch.trim().toLocaleLowerCase('ru')
  const filteredMenu = useMemo(() => menu.map((category) => ({
    ...category,
    items: category.items.filter((item) => !normalizedSearch || `${item.name} ${item.description ?? ''}`.toLocaleLowerCase('ru').includes(normalizedSearch)),
  })).filter((category) => category.items.length > 0), [menu, normalizedSearch])
  const groups = selectedItem?.modifierGroups?.map(({ modifierGroup }) => modifierGroup) ?? []
  const chosenModifiers = useMemo(() => groups.flatMap((group) => group.modifiers.filter((modifier) => selected[group.id]?.includes(modifier.id))), [groups, selected])
  const unitPrice = selectedItem ? Number(selectedItem.priceByn) + chosenModifiers.reduce((sum, modifier) => sum + Number(modifier.price), 0) : 0
  const openDish = (item: MenuItem) => { if (item.isInStopList) return; setSelectedItem(item); setQuantity(1); setSelected({}); setValidationError(false) }
  const toggleModifier = (group: typeof groups[number], modifier: Modifier) => {
    setSelected((current) => {
      const chosen = current[group.id] ?? []
      if (chosen.includes(modifier.id)) return { ...current, [group.id]: chosen.filter((id) => id !== modifier.id) }
      if (group.maxSelection === 1) return { ...current, [group.id]: [modifier.id] }
      if (group.maxSelection !== null && chosen.length >= group.maxSelection) return current
      return { ...current, [group.id]: [...chosen, modifier.id] }
    })
    setValidationError(false)
  }
  const submitDish = () => {
    if (!selectedItem || selectedItem.isInStopList || groups.some((group) => (selected[group.id]?.length ?? 0) < Math.max(group.isRequired ? 1 : 0, group.minSelection))) { setValidationError(true); return }
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
        if (response.status === 403) { setTenantBlocked(true); throw new Error('Tenant is blocked') }
        if (!response.ok) throw new Error('Unable to resolve table QR token')
        return response.json() as Promise<GuestSession>
      })
      .then(async (resolvedSession) => {
        sessionResolved = true
        window.sessionStorage.setItem('qrToken', qrToken)
        window.sessionStorage.setItem('tableSessionToken', resolvedSession.tableSessionToken)
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
          { headers: { 'X-QR-Token': qrToken }, signal: controller.signal },
        )
        if (!response.ok) throw new Error('Unable to load guest menu')
        setMenu(await response.json() as GuestMenu)
        setMenuLoaded(true)
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === 'AbortError') return
        if (!sessionResolved && !(requestError instanceof Error && requestError.message === 'Tenant is blocked')) setError(true)
        else setMenuError(true)
      })

    return () => controller.abort()
  }, [qrToken])

  useEffect(() => {
    if (!qrToken) return
    const socketOrigin = API_BASE.replace(/\/api\/v1\/?$/, '')
    const tableSessionToken = session?.tableSessionToken ?? window.sessionStorage.getItem('tableSessionToken')
    const socket = io(socketOrigin, { auth: { qrToken, tableSessionToken }, transports: ['websocket', 'polling'] })
    socket.on('connect', () => socket.emit('join_table_room'))
    socket.on('payment.status_changed', (payload: { status: string }) => {
      setPaymentMessage(payload.status === 'COMPLETED' ? 'Оплата заказа подтверждена' : 'Оплата не прошла')
    })
    socket.on('tenant:service_mode_changed', (payload: { serviceMode: TenantConfig['serviceMode'] }) => {
      setTenantConfig((current) => current ? { ...current, serviceMode: payload.serviceMode } : current)
    })
    return () => { socket.disconnect() }
  }, [qrToken, session?.tableSessionToken])

  return (
    <main className="flex min-h-svh items-center justify-center bg-background" style={{ '--color-primary': tenantConfig?.brandColor ?? '#e0533c' } as React.CSSProperties}>
      <section className="w-full max-w-2xl px-4 text-center">
        <header className="flex items-center justify-between"><h1 className="text-2xl font-semibold text-primary">Bonapp</h1><span aria-label="Количество товаров в корзине">Корзина · {cartCount}</span></header>
        {!qrToken && import.meta.env.DEV && <nav aria-label="Тестовые столы" className="mx-auto my-5 max-w-sm rounded-xl border p-4 text-left">
          <h2 className="mb-2 font-semibold">Столы для локальной разработки</h2>
          <ul className="space-y-1">
            <li><a className="text-primary underline" href="/t/dev-table-1">Стол 1</a></li>
            <li><a className="text-primary underline" href="/t/dev-table-2">Стол 2</a></li>
            <li><a className="text-primary underline" href="/t/dev-table-3">Стол 3</a></li>
          </ul>
        </nav>}
        {!qrToken && <p>Сканируйте QR-код</p>}
        {tenantBlocked && <section role="status"><h2>Ресторан временно не принимает заказы</h2><p>Создание новых заказов недоступно.</p></section>}
        {qrToken && !session && !error && <p>Открываем стол…</p>}
        {session && tenantConfig && <>
          <div className="flex items-center justify-center gap-2">{tenantConfig?.logoUrl && <img src={tenantConfig.logoUrl} alt="Логотип заведения" className="h-10 w-10 object-contain" />}<h2>{session.tenant.name}</h2></div>
          <p>Стол №{session.table.tableNumber} · {session.table.areaName}</p>
          <button onClick={() => setCallModalOpen(true)}>Вызвать официанта</button>
          {callStatus && <p role="status">{callStatus}</p>}
          {callModalOpen && <section role="dialog" aria-modal="true" aria-label="Вызвать официанта">
            <h3>Вызвать официанта</h3>
            <button onClick={() => void callWaiter('NEED_BILL')}>Попросить счёт</button>
            <button onClick={() => void callWaiter('CALL_STAFF')}>Позвать официанта</button>
            <button onClick={() => setCallModalOpen(false)}>Закрыть</button>
          </section>}
          {session.activeOrder && <p>Активный заказ: {session.activeOrder.status}</p>}
          {paymentMessage && <p role="status">{paymentMessage}</p>}
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
            {!menuError && menuLoaded && menu.length > 0 && <input type="search" aria-label="Поиск блюд" placeholder="Поиск по названию или описанию" value={menuSearch} onChange={(event) => setMenuSearch(event.target.value)} className="my-3 w-full rounded-xl border bg-surface px-4 py-3 text-left" />}
            {!menuError && menuLoaded && menu.length > 0 && filteredMenu.length === 0 && <p>Ничего не найдено</p>}
            {filteredMenu.length > 0 && <nav aria-label="Категории меню" className="flex gap-3 overflow-x-auto">
              {filteredMenu.map((category) => <a key={category.id} href={`#category-${category.id}`} className="whitespace-nowrap">{category.name}</a>)}
            </nav>}
            {filteredMenu.map((category) => <section key={category.id} id={`category-${category.id}`} className="scroll-mt-4">
              <h4>{category.name}</h4>
              <ul>{category.items.map((item) => <li key={item.id} className="flex items-center gap-3 border-b py-3 text-left">
                <button type="button" disabled={item.isInStopList} onClick={() => openDish(item)} aria-label={`Открыть ${item.name}`} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg text-left disabled:cursor-not-allowed">
                  {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className={`h-24 w-24 object-cover ${item.isInStopList ? 'grayscale' : ''}`} /> : <span aria-label="Фото отсутствует" className="flex h-24 w-24 items-center justify-center bg-surface-container-high">Фото</span>}
                  {item.isInStopList && <span className="absolute inset-0 bg-black/20" aria-hidden="true" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><strong>{item.name}</strong>{item.isHit && <span aria-label="Хит">🔥</span>}</div>
                  {item.description && <p className="line-clamp-2">{item.description}</p>}
                  <span>{money(Number(item.priceByn), session.tenant.currency)}</span>
                  {item.isInStopList && <p role="status">Нет в наличии</p>}
                  {canAddToOrder && <button disabled={item.isInStopList} onClick={() => void addToOrder(item.id)}>Добавить {item.name}</button>}
                  {!canAddToOrder && tenantConfig?.serviceMode !== 'VIEW_ONLY' && <button type="button" disabled={item.isInStopList} onClick={() => openDish(item)}>Выбрать · {item.name}</button>}
                </div>
              </li>)}</ul>
            </section>)}
          </section>
          {!canAddToOrder && cart.length > 0 && <a href={`/order/checkout?qr_token=${encodeURIComponent(qrToken ?? '')}`}>Оформить заказ ({cart.reduce((sum, item) => sum + item.quantity, 0)})</a>}
        </>}
        {error && <p role="alert">Стол не найден</p>}
      </section>
      {selectedItem && session && <div className="fixed inset-0 z-20 flex items-end bg-black/50" onClick={() => setSelectedItem(null)}>
        <section role="dialog" aria-modal="true" aria-labelledby="dish-title" onClick={(event) => event.stopPropagation()} className="max-h-[92svh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 pb-7 text-left shadow-xl">
          {selectedItem.imageUrl && <img src={selectedItem.imageUrl} alt={selectedItem.name} className="mb-4 h-52 w-full rounded-xl object-cover" />}
          <h2 id="dish-title" className="text-2xl font-semibold">{selectedItem.name}</h2>
          {selectedItem.description && <p className="mt-2">{selectedItem.description}</p>}
          {(selectedItem.weightGrams != null || selectedItem.calories != null) && <p className="mt-3 text-sm">{selectedItem.weightGrams != null && `${selectedItem.weightGrams} г`}{selectedItem.calories != null && ` · ${selectedItem.calories} ккал`}{selectedItem.proteins != null && ` · Б ${selectedItem.proteins} г`}{selectedItem.fats != null && ` · Ж ${selectedItem.fats} г`}{selectedItem.carbs != null && ` · У ${selectedItem.carbs} г`}</p>}
          {!!selectedItem.allergens?.length && <div className="mt-3 flex flex-wrap gap-2">{selectedItem.allergens.map((allergen) => <span key={allergen} className="rounded-full bg-surface-container-high px-3 py-1 text-xs">{allergenLabels[allergen] ?? allergen}</span>)}</div>}
          <div className="mt-5 space-y-4">{groups.map((group) => <fieldset key={group.id}><legend className="mb-2 font-semibold">{group.name}<span className="ml-2 text-sm font-normal">{Math.max(group.isRequired ? 1 : 0, group.minSelection) > 0 ? `Выберите от ${Math.max(group.isRequired ? 1 : 0, group.minSelection)}` : 'Необязательно'}{group.maxSelection !== null ? ` до ${group.maxSelection}` : ''}</span></legend>{group.modifiers.map((modifier) => { const radio = group.maxSelection === 1; return <label key={modifier.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3"><input type={radio ? 'radio' : 'checkbox'} name={`modifier-${group.id}`} checked={selected[group.id]?.includes(modifier.id) ?? false} onChange={() => toggleModifier(group, modifier)} /><span className="flex-1">{modifier.name}</span>{Number(modifier.price) !== 0 && <span>+{money(Number(modifier.price), session.tenant.currency)}</span>}</label> })}</fieldset>)}</div>
          {validationError && <p role="alert" className="mt-3 text-error">Выберите обязательные модификаторы</p>}
          <div className="mt-5 flex items-center justify-between"><div className="flex items-center gap-4"><button aria-label="Уменьшить количество" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><span>{quantity}</span><button aria-label="Увеличить количество" onClick={() => setQuantity((value) => value + 1)}>+</button></div><button onClick={submitDish}>Добавить в заказ · {money(unitPrice * quantity, session.tenant.currency)}</button></div>
        </section>
      </div>}
    </main>
  )
}
