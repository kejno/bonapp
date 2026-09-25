import { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'

type GuestSession = {
  tenant: { name: string }
  table: { tableNumber: number; areaName: string }
  activeOrder: { id: string; status: string } | null
}

export default function App() {
  const qrToken = new URLSearchParams(window.location.search).get('qr_token')
  const [session, setSession] = useState<GuestSession | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!qrToken) return

    const controller = new AbortController()
    fetch(`${API_BASE}/guest/session/${encodeURIComponent(qrToken)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to resolve table QR token')
        return response.json() as Promise<GuestSession>
      })
      .then(setSession)
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === 'AbortError') return
        setError(true)
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
        </>}
        {error && <p role="alert">Не удалось открыть стол по QR-коду</p>}
      </section>
    </main>
  )
}
