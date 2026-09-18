import { useEffect, useMemo, useState } from 'react'
import { useCartStore } from './cart-store'

type Dish = {
  id: string
  name: string
  description: string | null
  price: number
  imageUrl?: string | null
  isHit: boolean
  isInStopList: boolean
  modifiers: unknown[]
}

type Menu = {
  tableNumber: number
  categories: { id: string; name: string; dishes: Dish[] }[]
}

const formatPrice = (price: number) => `${(price / 100).toFixed(2)} BYN`

function App() {
  const [menu, setMenu] = useState<Menu | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState(false)
  const itemCount = useCartStore((state) => state.itemCount)

  useEffect(() => {
    const token = window.location.pathname.match(/^\/guest\/t\/([^/]+)$/)?.[1]
    const request = token
      ? fetch('/api/v1/guest/menu', { headers: { 'X-Table-Session-Token': token } })
      : fetch('/api/v1/guest/menu')
    request
      .then(async (response) => {
        if (!response.ok) throw new Error('menu request failed')
        setMenu(await response.json())
      })
      .catch(() => setError(true))
  }, [])

  const categories = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!menu || !normalizedQuery) return menu?.categories ?? []
    return menu.categories
      .map((category) => ({
        ...category,
        dishes: category.dishes.filter((dish) =>
          `${dish.name} ${dish.description ?? ''}`.toLocaleLowerCase().includes(normalizedQuery),
        ),
      }))
      .filter((category) => category.dishes.length > 0)
  }, [menu, query])

  if (error) {
    return <main className="p-6 text-bonapp-accent">Отсканируйте актуальный QR-код или обратитесь к персоналу.</main>
  }

  if (!menu) return <main className="p-6">Загружаем меню…</main>

  return (
    <main className="min-h-svh bg-bonapp-bg pb-20 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-bonapp-bg px-4 py-3">
        <div className="flex items-center justify-between">
          <strong className="text-xl text-bonapp-accent">Bonapp</strong>
          <span>Стол №{menu.tableNumber}</span>
        </div>
        <input
          aria-label="Поиск блюд"
          className="mt-3 w-full rounded-xl border border-stone-300 bg-white px-3 py-2"
          placeholder="Поиск по меню"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <nav aria-label="Категории" className="mt-3 flex gap-2 overflow-x-auto">
          {categories.map((category) => <button className="shrink-0 rounded-full bg-white px-3 py-1.5" key={category.id} onClick={() => document.getElementById(category.id)?.scrollIntoView()} type="button">{category.name}</button>)}
        </nav>
      </header>
      <div className="space-y-7 px-4 py-5">
        {categories.map((category) => (
          <section id={category.id} key={category.id}>
            <h1 className="mb-3 text-xl font-semibold">{category.name}</h1>
            <div className="space-y-3">
              {category.dishes.map((dish) => (
                <article className={`flex gap-3 rounded-2xl bg-white p-3 ${dish.isInStopList ? 'opacity-55 grayscale' : ''}`} key={dish.id}>
                  {dish.imageUrl ? <img alt="" className="h-24 w-24 rounded-xl object-cover" src={dish.imageUrl} /> : <div className="h-24 w-24 rounded-xl bg-stone-200" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2"><h2 className="font-semibold">{dish.name} {dish.isHit && <span aria-label="Хит">🔥</span>}</h2><span className="shrink-0 font-medium">{formatPrice(dish.price)}</span></div>
                    {dish.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{dish.description}</p>}
                    {dish.isInStopList && <span className="mt-2 inline-block text-sm font-medium">Нет в наличии</span>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      <footer className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white px-4 py-3 text-center">Корзина · {itemCount} позиций</footer>
    </main>
  )
}

export default App
