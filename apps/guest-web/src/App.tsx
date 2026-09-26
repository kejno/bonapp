import { useEffect, useState } from 'react'
import { getGuestSessionId } from './guest-session'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'

type GuestSession = {
  tenant: { id: string; name: string; currency: string }
  table: { tableNumber: number; areaName: string }
  activeOrder: { id: string; status: string } | null
}

type GuestMenu = Array<{
  id: string
  name: string
  items: Array<{ id: string; name: string; description: string | null; price: string | number }>
}>

export default function App() {
  const qrToken = new URLSearchParams(window.location.search).get('qr_token')
  const [session, setSession] = useState<GuestSession | null>(null)
  const [menu, setMenu] = useState<GuestMenu>([])
  const [menuLoaded, setMenuLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [menuError, setMenuError] = useState(false)

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
        getGuestSessionId()
        setSession(resolvedSession)
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

  return (
    <main className="flex min-h-svh items-center justify-center bg-background">
      <section className="text-center">
        <h1 className="text-2xl font-semibold text-primary">Bonapp — Guest</h1>
        {qrToken && !session && !error && <p>Открываем стол…</p>}
        {session && <>
          <h2>{session.tenant.name}</h2>
          <p>Стол {session.table.tableNumber} · {session.table.areaName}</p>
          {session.activeOrder && <p>Активный заказ: {session.activeOrder.status}</p>}
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
                <span>{item.price} {session.tenant.currency}</span>
              </li>)}</ul>
            </section>)}
          </section>
        </>}
        {error && <p role="alert">Не удалось открыть стол по QR-коду</p>}
      </section>
    </main>
  )
}
