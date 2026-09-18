import { useEffect, useState } from 'react'
import { type GuestSession, useGuestSessionStore } from './guest-session-store'

type PageState = 'missing-token' | 'loading' | 'not-found' | 'error' | 'ready'

const getQrToken = () => /^\/t\/([^/]+)$/.exec(window.location.pathname)?.[1]

function App() {
  const session = useGuestSessionStore((state) => state.session)
  const setSession = useGuestSessionStore((state) => state.setSession)
  const clearSession = useGuestSessionStore((state) => state.clearSession)
  const [pageState, setPageState] = useState<PageState>(() =>
    getQrToken() ? 'loading' : 'missing-token',
  )

  useEffect(() => {
    const qrToken = getQrToken()
    if (!qrToken) return

    clearSession()
    void fetch(`/api/v1/guest/session/${encodeURIComponent(qrToken)}`)
      .then(async (response) => {
        if (response.status === 404) {
          setPageState('not-found')
          return
        }
        if (!response.ok) throw new Error('Session request failed')
        const guestSession = (await response.json()) as GuestSession
        setSession(guestSession)
        document.documentElement.style.setProperty('--color-primary', guestSession.brandColor)
        setPageState('ready')
      })
      .catch(() => setPageState('error'))
  }, [clearSession, setSession])

  if (pageState === 'loading') {
    return <Splash />
  }

  if (pageState === 'missing-token') return <Message text="Сканируйте QR-код" />
  if (pageState === 'not-found') return <Message text="Стол не найден" />
  if (pageState === 'error') return <Message text="Нет соединения" />

  return (
    <main className="flex min-h-svh items-center justify-center bg-bonapp-bg p-6 text-center">
      <section>
        {session?.logoUrl && <img className="mx-auto mb-4 h-16 max-w-48 object-contain" src={session.logoUrl} alt={`Логотип ${session.tenantName}`} />}
        <h1 className="text-3xl font-semibold text-[var(--color-primary)]">{session?.tenantName}</h1>
        <p className="mt-3 text-xl text-slate-700">Стол №{session?.tableNumber}</p>
      </section>
    </main>
  )
}

function Splash() {
  return <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-bonapp-bg"><span className="text-3xl font-semibold text-[var(--color-primary)]">Bonapp</span><span role="status" className="animate-pulse text-slate-600">Загрузка</span></main>
}

function Message({ text }: { text: string }) {
  return <main className="flex min-h-svh items-center justify-center bg-bonapp-bg p-6 text-center"><h1 className="text-2xl font-semibold text-[var(--color-primary)]">{text}</h1></main>
}

export default App
