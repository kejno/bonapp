import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { calculateUnitPrice, type SelectedModifier, useCartStore } from './cart'
import { io } from 'socket.io-client'
import OrderStatusPage from './OrderStatusPage'
import { useGuestSessionStore } from './guest-session.store'
import { createGuestManifest } from './pwa-manifest'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'
type GuestSession = {
  tenant: { id: string; name: string; currency: string; logoUrl?: string | null; brandColor?: string | null }
  table: { id: string; tableNumber: number; areaName: string }
  activeOrder: { id: string; status: string } | null
}
type Modifier = { id: string; name: string; price: string | number }
type ModifierGroup = { modifierGroup: { id: string; name: string; isRequired: boolean; minSelection: number; maxSelection: number | null; modifiers: Modifier[] } }
type MenuItem = { id: string; name: string; description: string | null; priceByn: string | number; imageUrl?: string | null; isHit?: boolean; isInStopList?: boolean; weightGrams?: number | null; calories?: number | null; proteins?: number | string | null; fats?: number | string | null; carbs?: number | string | null; allergens?: string[]; modifierGroups?: ModifierGroup[] }
type GuestMenu = Array<{ id: string; name: string; items: MenuItem[] }>
type TenantConfig = { logoUrl: string | null; brandColor: string; serviceMode: 'ORDER_AND_PAY' | 'VIEW_ONLY' | 'TAKEAWAY' }
const allergenLabels: Record<string, string> = { GLUTEN: 'Глютен', CRUSTACEANS: 'Ракообразные', EGGS: 'Яйца', FISH: 'Рыба', PEANUTS: 'Арахис', SOYBEANS: 'Соя', MILK: 'Молоко', NUTS: 'Орехи', CELERY: 'Сельдерей', MUSTARD: 'Горчица', SESAME: 'Кунжут', SULPHITES: 'Сульфиты', LUPIN: 'Люпин', MOLLUSCS: 'Моллюски' }
const money = (value: number, currency: string) => `${value.toFixed(2)} ${currency}`

export default function App() {
  const statusMatch = window.location.pathname.match(/^\/order\/([^/]+)\/status$/)
  if (statusMatch) return <OrderStatusPage orderId={decodeURIComponent(statusMatch[1])} />
  const search = new URLSearchParams(window.location.search)
  const qrToken = window.location.pathname.match(/^\/t\/([^/]+)\/?$/)?.[1] ?? search.get('qr_token')
  const orderId = search.get('orderId')
  const setGuestSession = useGuestSessionStore((store) => store.setSession)
  const clearGuestSession = useGuestSessionStore((store) => store.clearSession)
  const [session, setSession] = useState<GuestSession | null>(null)
  const [menu, setMenu] = useState<GuestMenu>([])
  const [query, setQuery] = useState('')
  const [menuLoaded, setMenuLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [menuError, setMenuError] = useState(false)
  const [tenantConfig, setTenantConfig] = useState<TenantConfig | null>(null)
  const [orderItemMessage, setOrderItemMessage] = useState('')
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [validationError, setValidationError] = useState(false)
  const addItem = useCartStore((store) => store.addItem)
  const cartCount = useCartStore((store) => store.itemCount())
  const groups = selectedItem?.modifierGroups?.map(({ modifierGroup }) => modifierGroup) ?? []
  const chosenModifiers: SelectedModifier[] = useMemo(() => groups.flatMap((group) => group.modifiers.filter((modifier) => selected[group.id]?.includes(modifier.id)).map((modifier) => ({ id: modifier.id, name: modifier.name, price: Number(modifier.price) }))), [groups, selected])
  const unitPrice = selectedItem ? calculateUnitPrice(Number(selectedItem.priceByn), chosenModifiers) : 0
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
    addItem({ itemId: selectedItem.id, quantity, selectedModifiers: chosenModifiers, unitPrice })
    setSelectedItem(null)
  }
  const canAddToOrder = Boolean(orderId && session?.activeOrder?.id === orderId && ['NEW', 'COOKING'].includes(session.activeOrder.status))

  async function addToOrder(itemId: string) {
    if (!qrToken || !orderId || !canAddToOrder) return
    try {
      const response = await fetch(`${API_BASE}/guest/orders/${encodeURIComponent(orderId)}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-QR-Token': qrToken }, body: JSON.stringify({ itemId, quantity: 1 }) })
      if (!response.ok) throw new Error('Unable to add item')
      setOrderItemMessage('Позиция добавлена в заказ')
    } catch { setOrderItemMessage('Не удалось добавить позицию в заказ') }
  }

  useEffect(() => {
    if (!qrToken) { clearGuestSession(); return }
    const controller = new AbortController()
    let sessionResolved = false
    fetch(`${API_BASE}/guest/session/${encodeURIComponent(qrToken)}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Unable to resolve table QR token'); return response.json() as Promise<GuestSession> })
      .then(async (resolvedSession) => {
        sessionResolved = true
        setSession(resolvedSession)
        const brandColor = resolvedSession.tenant.brandColor ?? '#e0533c'
        setGuestSession({ tenantId: resolvedSession.tenant.id, tableId: resolvedSession.table.id, tableNumber: resolvedSession.table.tableNumber, brandColor, logoUrl: resolvedSession.tenant.logoUrl ?? null })
        document.documentElement.style.setProperty('--color-primary', brandColor)
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', brandColor)
        const configResponse = await fetch(`${API_BASE}/guest/tenant/config?tenantId=${encodeURIComponent(resolvedSession.tenant.id)}`, { signal: controller.signal })
        if (!configResponse.ok) throw new Error('Unable to load tenant config')
        setTenantConfig(await configResponse.json() as TenantConfig)
        const response = await fetch(`${API_BASE}/guest/menu`, { signal: controller.signal, headers: { 'X-QR-Token': qrToken } })
        if (!response.ok) throw new Error('Unable to load guest menu')
        setMenu(await response.json() as GuestMenu)
        setMenuLoaded(true)
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === 'AbortError') return
        if (!sessionResolved) { clearGuestSession(); setError(true) }
        else setMenuError(true)
      })
    return () => controller.abort()
  }, [qrToken, clearGuestSession, setGuestSession])

  useEffect(() => {
    if (!qrToken) return
    const socketOrigin = API_BASE.replace(/\/api\/v1\/?$/, '')
    const socket = io(socketOrigin, { auth: { qrToken }, transports: ['websocket', 'polling'] })
    socket.on('tenant:service_mode_changed', (payload: { serviceMode: TenantConfig['serviceMode'] }) => setTenantConfig((current) => current ? { ...current, serviceMode: payload.serviceMode } : current))
    return () => { socket.disconnect() }
  }, [qrToken])

  useEffect(() => {
    const brandColor = tenantConfig?.brandColor ?? session?.tenant.brandColor
    if (!brandColor || typeof URL.createObjectURL !== 'function') return
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (!manifestLink) return
    const previousHref = manifestLink.href
    const manifestUrl = URL.createObjectURL(new Blob([createGuestManifest(brandColor)], { type: 'application/manifest+json' }))
    manifestLink.href = manifestUrl
    return () => {
      URL.revokeObjectURL(manifestUrl)
      manifestLink.href = previousHref
    }
  }, [session?.tenant.brandColor, tenantConfig?.brandColor])

  const filteredMenu = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru')
    return menu.map((category) => ({ ...category, items: category.items.filter((item) => !normalized || `${item.name} ${item.description ?? ''}`.toLocaleLowerCase('ru').includes(normalized)) })).filter((category) => category.items.length > 0)
  }, [menu, query])

  return <main className="min-h-svh bg-background pb-24 text-on-background" style={{ '--color-primary': tenantConfig?.brandColor ?? session?.tenant.brandColor ?? '#e0533c' } as CSSProperties}>
    {!session && <section className="flex min-h-svh items-center justify-center text-center"><div><h1 className="text-2xl font-semibold text-primary">Bonapp</h1>{qrToken && !error && <p className="mt-3">Открываем стол…</p>}{!qrToken && <p className="mt-3">Сканируйте QR-код</p>}{error && <p role="alert" className="mt-3">Стол не найден</p>}</div></section>}
    {session && <>
      <header className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-4"><div className="flex min-w-0 items-center gap-3">{(tenantConfig?.logoUrl || session.tenant.logoUrl) && <img src={tenantConfig?.logoUrl || session.tenant.logoUrl || ''} alt="" className="h-10 w-10 rounded-xl object-cover" />}<div className="min-w-0"><h1 className="truncate text-lg font-semibold">{session.tenant.name}</h1><p className="text-sm text-on-background/65">Стол №{session.table.tableNumber}</p></div></div></header>
      <div className="sticky top-0 z-10 border-y border-on-background/10 bg-background/95 backdrop-blur"><nav aria-label="Категории меню" className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-3">{menu.map((category) => <a key={category.id} href={`#category-${category.id}`} className="shrink-0 rounded-full bg-surface-card px-4 py-2 text-sm">{category.name}</a>)}</nav></div>
      <section aria-label="Меню" className="mx-auto max-w-3xl px-4"><label className="my-5 block"><span className="sr-only">Поиск по меню</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти блюдо" className="w-full rounded-xl border border-on-background/15 bg-surface-card px-4 py-3 outline-primary" /></label>
        {menuError && <p role="alert">Не удалось загрузить меню</p>}{!menuError && !menuLoaded && <p>Загружаем меню…</p>}{!menuError && menuLoaded && filteredMenu.length === 0 && <p className="py-8 text-center text-on-background/60">Ничего не найдено</p>}
        {filteredMenu.map((category) => <section key={category.id} id={`category-${category.id}`} className="mb-8 scroll-mt-28"><h2 className="mb-3 text-xl font-semibold">{category.name}</h2><ul className="space-y-3">{category.items.map((item) => <li key={item.id} className={`flex gap-3 rounded-2xl bg-surface-card p-3 ${item.isInStopList ? 'opacity-55 grayscale' : ''}`}>
          {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" /> : <div aria-hidden="true" className="h-24 w-24 shrink-0 rounded-xl bg-on-background/5" />}<div className="flex min-w-0 flex-1 flex-col"><button type="button" onClick={() => !item.isInStopList && openDish(item)} className="text-left"><h3 className="font-semibold">{item.name}{item.isHit && <span aria-label="Хит" className="ml-1">🔥</span>}</h3></button>{item.isInStopList && <span className="text-xs">Нет в наличии</span>}{item.description && <p className="line-clamp-2 mt-1 text-sm text-on-background/65">{item.description}</p>}<div className="mt-auto flex items-end justify-between gap-2 pt-2"><span className="font-semibold">{money(Number(item.priceByn), session.tenant.currency)}</span>{canAddToOrder && <button type="button" disabled={item.isInStopList} onClick={() => void addToOrder(item.id)} className="rounded-full bg-primary px-4 py-2 text-sm text-white disabled:opacity-50">Добавить {item.name}</button>}</div></div>
        </li>)}</ul></section>)}
      </section>
      {session.activeOrder && <p className="mx-auto max-w-3xl px-4">Активный заказ: {session.activeOrder.status}</p>}{orderItemMessage && <p role="status" className="mx-auto max-w-3xl px-4">{orderItemMessage}</p>}{session.activeOrder && <a className="mx-auto block max-w-3xl px-4" href={`/order/${encodeURIComponent(session.activeOrder.id)}/status?qr_token=${encodeURIComponent(qrToken ?? '')}`}>Статус заказа</a>}{tenantConfig?.serviceMode === 'VIEW_ONLY' && <p className="mx-auto max-w-3xl px-4">Заказы временно недоступны</p>}{tenantConfig?.serviceMode === 'TAKEAWAY' && <p className="mx-auto max-w-3xl px-4">Доступен самовывоз</p>}
      <nav aria-label="Корзина" className="fixed inset-x-0 bottom-0 z-20 border-t border-on-background/10 bg-background px-4 py-3"><button type="button" aria-label="Количество товаров в корзине" className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-xl bg-primary px-5 py-3 font-semibold text-white"><span>Корзина</span><span>{cartCount}</span></button></nav>
    </>}
    {selectedItem && session && <div className="fixed inset-0 z-20 flex items-end bg-black/50" onClick={() => setSelectedItem(null)}><section role="dialog" aria-modal="true" aria-labelledby="dish-title" onClick={(event) => event.stopPropagation()} className="max-h-[92svh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 pb-7 text-left shadow-xl">{selectedItem.imageUrl && <img src={selectedItem.imageUrl} alt={selectedItem.name} className="mb-4 h-52 w-full rounded-xl object-cover" />}<h2 id="dish-title" className="text-2xl font-semibold">{selectedItem.name}</h2>{selectedItem.description && <p className="mt-2">{selectedItem.description}</p>}{(selectedItem.weightGrams != null || selectedItem.calories != null) && <p className="mt-3 text-sm">{selectedItem.weightGrams != null && `${selectedItem.weightGrams} г`}{selectedItem.calories != null && ` · ${selectedItem.calories} ккал`}{selectedItem.proteins != null && ` · Б ${selectedItem.proteins} г`}{selectedItem.fats != null && ` · Ж ${selectedItem.fats} г`}{selectedItem.carbs != null && ` · У ${selectedItem.carbs} г`}</p>}{!!selectedItem.allergens?.length && <div className="mt-3 flex flex-wrap gap-2">{selectedItem.allergens.map((allergen) => <span key={allergen} className="rounded-full bg-surface-container-high px-3 py-1 text-xs">{allergenLabels[allergen] ?? allergen}</span>)}</div>}<div className="mt-5 space-y-4">{groups.map((group) => <fieldset key={group.id}><legend className="mb-2 font-semibold">{group.name}<span className="ml-2 text-sm font-normal">{group.isRequired ? 'Выберите 1' : `До ${group.maxSelection ?? 'любого количества'}`}</span></legend>{group.modifiers.map((modifier) => { const radio = group.isRequired || group.maxSelection === 1; return <label key={modifier.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3"><input type={radio ? 'radio' : 'checkbox'} name={`modifier-${group.id}`} checked={selected[group.id]?.includes(modifier.id) ?? false} onChange={() => toggleModifier(group, modifier)} /><span className="flex-1">{modifier.name}</span>{Number(modifier.price) !== 0 && <span>+{money(Number(modifier.price), session.tenant.currency)}</span>}</label> })}</fieldset>)}</div>{validationError && <p role="alert" className="mt-3 text-error">Выберите обязательные модификаторы</p>}<div className="mt-5 flex items-center justify-between"><div className="flex items-center gap-4"><button aria-label="Уменьшить количество" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><span>{quantity}</span><button aria-label="Увеличить количество" onClick={() => setQuantity((value) => value + 1)}>+</button></div><button onClick={submitDish}>Добавить в заказ · {money(unitPrice * quantity, session.tenant.currency)}</button></div></section></div>}
  </main>
}
