import { useEffect, useMemo, useState } from 'react'
import { calculateUnitPrice, type SelectedModifier, useCartStore } from './cart'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'
type GuestSession = { tenant: { id: string; name: string; currency: string }; table: { tableNumber: number; areaName: string }; activeOrder: { id: string; status: string } | null }
type Modifier = { id: string; name: string; price: string | number }
type ModifierGroup = { modifierGroup: { id: string; name: string; isRequired: boolean; minSelection: number; maxSelection: number | null; modifiers: Modifier[] } }
type MenuItem = { id: string; name: string; description: string | null; priceByn: string | number; imageUrl?: string | null; weightGrams?: number | null; calories?: number | null; proteins?: number | string | null; fats?: number | string | null; carbs?: number | string | null; allergens?: string[]; modifierGroups?: ModifierGroup[] }
type GuestMenu = Array<{ id: string; name: string; items: MenuItem[] }>

const allergenLabels: Record<string, string> = { GLUTEN: 'Глютен', CRUSTACEANS: 'Ракообразные', EGGS: 'Яйца', FISH: 'Рыба', PEANUTS: 'Арахис', SOYBEANS: 'Соя', MILK: 'Молоко', NUTS: 'Орехи', CELERY: 'Сельдерей', MUSTARD: 'Горчица', SESAME: 'Кунжут', SULPHITES: 'Сульфиты', LUPIN: 'Люпин', MOLLUSCS: 'Моллюски' }
const money = (value: number, currency: string) => `${value.toFixed(2)} ${currency}`

export default function App() {
  const qrToken = new URLSearchParams(window.location.search).get('qr_token')
  const [session, setSession] = useState<GuestSession | null>(null)
  const [menu, setMenu] = useState<GuestMenu>([])
  const [menuLoaded, setMenuLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [menuError, setMenuError] = useState(false)
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [validationError, setValidationError] = useState(false)
  const addItem = useCartStore((store) => store.addItem)
  const cartCount = useCartStore((store) => store.itemCount())

  useEffect(() => {
    if (!qrToken) return
    const controller = new AbortController()
    let sessionResolved = false
    fetch(`${API_BASE}/guest/session/${encodeURIComponent(qrToken)}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Unable to resolve table QR token'); return response.json() as Promise<GuestSession> })
      .then(async (resolvedSession) => {
        sessionResolved = true
        setSession(resolvedSession)
        const response = await fetch(`${API_BASE}/guest/menu?tenantId=${encodeURIComponent(resolvedSession.tenant.id)}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Unable to load guest menu')
        setMenu(await response.json() as GuestMenu)
        setMenuLoaded(true)
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === 'AbortError') return
        if (!sessionResolved) setError(true); else setMenuError(true)
      })
    return () => controller.abort()
  }, [qrToken])

  useEffect(() => {
    if (!selectedItem) return
    window.history.pushState({ dishSheet: true }, '')
    const closeOnBack = () => setSelectedItem(null)
    window.addEventListener('popstate', closeOnBack)
    return () => window.removeEventListener('popstate', closeOnBack)
  }, [selectedItem])

  const groups = selectedItem?.modifierGroups?.map(({ modifierGroup }) => modifierGroup) ?? []
  const chosenModifiers: SelectedModifier[] = useMemo(() => groups.flatMap((group) => group.modifiers
    .filter((modifier) => selected[group.id]?.includes(modifier.id))
    .map((modifier) => ({ id: modifier.id, name: modifier.name, price: Number(modifier.price) }))), [groups, selected])
  const unitPrice = selectedItem ? calculateUnitPrice(Number(selectedItem.priceByn), chosenModifiers) : 0

  const openDish = (item: MenuItem) => { setSelectedItem(item); setQuantity(1); setSelected({}); setValidationError(false) }
  const closeDish = () => {
    setSelectedItem(null)
    if (window.history.state?.dishSheet) window.history.back()
  }
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
    if (!selectedItem || groups.some((group) => group.isRequired && !(selected[group.id]?.length))) { setValidationError(true); return }
    addItem({ itemId: selectedItem.id, quantity, selectedModifiers: chosenModifiers, unitPrice })
    closeDish()
  }

  return <main className="min-h-svh bg-background text-on-background">
    <header className="sticky top-0 z-10 flex items-center justify-between bg-surface px-4 py-3 shadow-sm"><strong className="text-xl text-primary">Bonapp</strong><span aria-label="Количество товаров в корзине">Корзина · {cartCount}</span></header>
    <div className="mx-auto max-w-2xl px-4 py-5">
      {qrToken && !session && !error && <p>Открываем стол…</p>}
      {session && <><h1 className="text-2xl font-semibold">{session.tenant.name}</h1><p className="mb-5 text-on-surface-variant">Стол {session.table.tableNumber} · {session.table.areaName}</p>
        {session.activeOrder && <p>Активный заказ: {session.activeOrder.status}</p>}
        <section aria-label="Меню"><h2 className="mb-3 text-xl font-semibold">Меню</h2>
          {menuError && <p role="alert">Не удалось загрузить меню</p>}{!menuError && !menuLoaded && <p>Загружаем меню…</p>}{!menuError && menuLoaded && menu.length === 0 && <p>Меню пока пусто</p>}
          {menu.map((category) => <section key={category.id} className="mb-6"><h3 className="mb-2 text-lg font-semibold">{category.name}</h3><div className="grid gap-3">{category.items.map((item) => <button key={item.id} type="button" onClick={() => openDish(item)} className="flex w-full items-center gap-3 rounded-xl bg-surface-card p-3 text-left shadow-sm">
            {item.imageUrl && <img src={item.imageUrl} alt="" className="h-20 w-20 rounded-lg object-cover" />}<span className="min-w-0 flex-1"><strong>{item.name}</strong>{item.description && <span className="mt-1 block line-clamp-2 text-sm text-on-surface-variant">{item.description}</span>}</span><span className="whitespace-nowrap font-semibold">{money(Number(item.priceByn), session.tenant.currency)}</span>
          </button>)}</div></section>)}
        </section></>}
      {error && <p role="alert">Не удалось открыть стол по QR-коду</p>}
    </div>
    {selectedItem && <div className="fixed inset-0 z-20 flex items-end bg-black/50" onClick={closeDish}>
      <section role="dialog" aria-modal="true" aria-labelledby="dish-title" onClick={(event) => event.stopPropagation()} className="max-h-[92svh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 pb-7 shadow-xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-outline-variant" />
        {selectedItem.imageUrl && <img src={selectedItem.imageUrl} alt={selectedItem.name} className="mb-4 h-52 w-full rounded-xl object-cover" />}
        <h2 id="dish-title" className="text-2xl font-semibold">{selectedItem.name}</h2>
        {selectedItem.description && <p className="mt-2 text-on-surface-variant">{selectedItem.description}</p>}
        {(selectedItem.weightGrams != null || selectedItem.calories != null) && <p className="mt-3 text-sm">{selectedItem.weightGrams != null && `${selectedItem.weightGrams} г`}{selectedItem.weightGrams != null && selectedItem.calories != null && ' · '}{selectedItem.calories != null && `${selectedItem.calories} ккал`}{selectedItem.proteins != null && ` · Б ${selectedItem.proteins} г`}{selectedItem.fats != null && ` · Ж ${selectedItem.fats} г`}{selectedItem.carbs != null && ` · У ${selectedItem.carbs} г`}</p>}
        {!!selectedItem.allergens?.length && <div className="mt-3 flex flex-wrap gap-2">{selectedItem.allergens.map((allergen) => <span key={allergen} className="rounded-full bg-surface-container-high px-3 py-1 text-xs">{allergenLabels[allergen] ?? allergen}</span>)}</div>}
        <div className="mt-5 space-y-4">{groups.map((group) => <fieldset key={group.id}><legend className="mb-2 font-semibold">{group.name}<span className="ml-2 text-sm font-normal text-on-surface-variant">{group.isRequired ? 'Выберите 1' : `До ${group.maxSelection ?? 'любого количества'}`}</span></legend><div className="space-y-2">{group.modifiers.map((modifier) => { const radio = group.isRequired || group.maxSelection === 1; const checked = selected[group.id]?.includes(modifier.id) ?? false; return <label key={modifier.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-outline-variant p-3"><input type={radio ? 'radio' : 'checkbox'} name={`modifier-${group.id}`} checked={checked} onChange={() => toggleModifier(group, modifier)} /><span className="flex-1">{modifier.name}</span>{Number(modifier.price) !== 0 && <span>+{money(Number(modifier.price), session?.tenant.currency ?? 'BYN')}</span>}</label> })}</div></fieldset>)}</div>
        {validationError && <p role="alert" className="mt-3 text-error">Выберите обязательные модификаторы</p>}
        <div className="mt-5 flex items-center justify-between"><div className="flex items-center gap-4"><button aria-label="Уменьшить количество" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="h-10 w-10 rounded-full bg-surface-container">−</button><span>{quantity}</span><button aria-label="Увеличить количество" onClick={() => setQuantity((value) => value + 1)} className="h-10 w-10 rounded-full bg-surface-container">+</button></div><button onClick={submitDish} className="rounded-xl bg-primary px-5 py-3 font-semibold text-on-primary">Добавить в заказ · {money(unitPrice * quantity, session?.tenant.currency ?? 'BYN')}</button></div>
      </section>
    </div>}
  </main>
}
