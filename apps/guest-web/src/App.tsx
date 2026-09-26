import { useEffect, useMemo, useState } from 'react'
import { useCartStore } from './cart.store'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'

type GuestSession = {
  tenant: { id: string; name: string; logoUrl?: string | null; currency: string }
  table: { tableNumber: number; areaName: string }
}

type GuestMenu = Array<{
  id: string
  name: string
  items: Array<{
    id: string
    name: string
    description: string | null
    priceByn: string | number
    imageUrl: string | null
    isHit: boolean
    isInStopList: boolean
    modifierGroups: Array<{ modifierGroup: { id: string; name: string; modifiers: Array<{ id: string; name: string; price: number | string }> } }>
  }>
}>

const money = (value: string | number) => `${Number(value).toFixed(2)} BYN`

export default function App() {
  const qrToken = new URLSearchParams(window.location.search).get('qr_token')
  const [session, setSession] = useState<GuestSession | null>(null)
  const [menu, setMenu] = useState<GuestMenu>([])
  const [query, setQuery] = useState('')
  const [menuLoaded, setMenuLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [menuError, setMenuError] = useState(false)
  const itemCount = useCartStore((state) => state.itemCount)
  const addItem = useCartStore((state) => state.addItem)
  const itemCountLabel = itemCount % 10 === 1 && itemCount % 100 !== 11
    ? 'позиция'
    : itemCount % 10 >= 2 && itemCount % 10 <= 4 && (itemCount % 100 < 12 || itemCount % 100 > 14)
      ? 'позиции'
      : 'позиций'

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
        setSession(resolvedSession)
        const response = await fetch(`${API_BASE}/guest/menu`, {
          signal: controller.signal,
          headers: { 'X-QR-Token': qrToken },
        })
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

  const filteredMenu = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru')
    return menu.map((category) => ({
      ...category,
      items: category.items.filter((item) => !normalizedQuery ||
        `${item.name} ${item.description ?? ''}`.toLocaleLowerCase('ru').includes(normalizedQuery)),
    })).filter((category) => category.items.length > 0)
  }, [menu, query])

  return (
    <main className="min-h-svh bg-background pb-24 text-on-background">
      {!session && <section className="flex min-h-svh items-center justify-center text-center">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Bonapp</h1>
          {qrToken && !error && <p className="mt-3">Открываем стол…</p>}
          {error && <p role="alert" className="mt-3">Не удалось открыть стол по QR-коду. Отсканируйте актуальный код.</p>}
        </div>
      </section>}
      {session && <>
        <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {session.tenant.logoUrl && <img src={session.tenant.logoUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">{session.tenant.name}</h1>
              <p className="text-sm text-on-background/65">Стол №{session.table.tableNumber}</p>
            </div>
          </div>
        </header>

        <div className="sticky top-0 z-10 border-y border-on-background/10 bg-background/95 backdrop-blur">
          <nav aria-label="Категории меню" className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-3">
            {menu.map((category) => <a key={category.id} href={`#category-${category.id}`} className="shrink-0 rounded-full bg-surface-card px-4 py-2 text-sm">{category.name}</a>)}
          </nav>
        </div>

        <section aria-label="Меню" className="mx-auto max-w-3xl px-4">
          <label className="my-5 block">
            <span className="sr-only">Поиск по меню</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти блюдо" className="w-full rounded-xl border border-on-background/15 bg-surface-card px-4 py-3 outline-primary" />
          </label>
          {menuError && <p role="alert">Не удалось загрузить меню</p>}
          {!menuError && !menuLoaded && <p>Загружаем меню…</p>}
          {!menuError && menuLoaded && filteredMenu.length === 0 && <p className="py-8 text-center text-on-background/60">Ничего не найдено</p>}
          {filteredMenu.map((category) => <section key={category.id} id={`category-${category.id}`} className="mb-8 scroll-mt-28">
            <h2 className="mb-3 text-xl font-semibold">{category.name}</h2>
            <ul className="space-y-3">{category.items.map((item) => <li key={item.id} className={`flex gap-3 rounded-2xl bg-surface-card p-3 ${item.isInStopList ? 'opacity-55 grayscale' : ''}`}>
              {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" /> : <div aria-hidden="true" className="h-24 w-24 shrink-0 rounded-xl bg-on-background/5" />}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{item.name}{item.isHit && <span aria-label="Хит" className="ml-1">🔥</span>}</h3>
                  {item.isInStopList && <span className="shrink-0 text-xs">Нет в наличии</span>}
                </div>
                {item.description && <p className="line-clamp-2 mt-1 text-sm text-on-background/65">{item.description}</p>}
                <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                  <span className="font-semibold">{money(item.priceByn)}</span>
                  <button type="button" disabled={item.isInStopList} onClick={() => addItem(item.id)} className="rounded-full bg-primary px-4 py-2 text-sm text-white disabled:opacity-50">Добавить</button>
                </div>
                {item.modifierGroups.length > 0 && <span className="mt-1 text-xs text-on-background/55">Есть модификаторы</span>}
              </div>
            </li>)}</ul>
          </section>)}
        </section>

        <nav aria-label="Корзина" className="fixed inset-x-0 bottom-0 z-20 border-t border-on-background/10 bg-background px-4 py-3">
          <button type="button" className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-xl bg-primary px-5 py-3 font-semibold text-white">
            <span>Корзина</span><span aria-label={`${itemCount} ${itemCountLabel}`}>{itemCount}</span>
          </button>
        </nav>
      </>}
    </main>
  )
}
