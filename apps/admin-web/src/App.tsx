import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import type { ReadinessStatus } from '@bonapp/shared-types'

const queryClient = new QueryClient()
const emptyReadiness: ReadinessStatus = {
  menuReady: false,
  tablesReady: false,
  paymentsReady: false,
}

function WelcomeDashboard() {
  const { data: readiness = emptyReadiness } = useQuery({
    queryKey: ['readiness'],
    queryFn: async (): Promise<ReadinessStatus> => {
      const response = await fetch('/api/v1/admin/readiness')
      if (!response.ok) throw new Error('Не удалось получить статус готовности')
      return response.json()
    },
    retry: false,
  })

  const canSimulateOrder = readiness.menuReady && readiness.tablesReady

  const openShift = async () => {
    const response = await fetch('/api/v1/admin/shifts/open', { method: 'POST' })
    if (response.ok) window.location.assign('/')
  }

  const simulateOrder = async () => {
    if (!canSimulateOrder) return

    const response = await fetch('/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isTest: true }),
    })
    if (response.ok) window.location.assign('/kds')
  }

  return (
    <main className="min-h-svh bg-bonapp-bg px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-8">
        <header>
          <p className="text-sm font-semibold text-bonapp-accent">Bonapp Admin</p>
          <h1 className="mt-2 text-3xl font-bold">Добро пожаловать!</h1>
          <p className="mt-2 text-slate-600">Проверьте готовность ресторана перед началом работы.</p>
        </header>

        <section aria-labelledby="readiness-title" className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 id="readiness-title" className="text-xl font-semibold">Чеклист готовности</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            <ReadinessItem label="Меню добавлено" ready={readiness.menuReady} />
            <ReadinessItem label="Столы созданы" ready={readiness.tablesReady} />
            <ReadinessItem label="Платежи настроены" ready={readiness.paymentsReady} />
          </ul>
        </section>

        <section className="grid gap-4 sm:grid-cols-2" aria-label="Текущий статус">
          <EmptyState title="Нет заказов" description="Новые заказы появятся здесь после оформления гостями." />
          <EmptyState title="Нет активной смены" description="Откройте смену, когда будете готовы начать работу." />
        </section>

        <section className="rounded-2xl border border-bonapp-accent/20 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Тест QR</h2>
          <p className="mt-2 text-slate-600">Создайте тестовый заказ и проверьте его отображение на кухне.</p>
          <button
            className="mt-4 rounded-lg bg-bonapp-accent px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSimulateOrder}
            onClick={simulateOrder}
          >
            Симулировать тестовый заказ
          </button>
          {!canSimulateOrder && <p className="mt-2 text-sm text-slate-500">Добавьте стол и активную позицию меню, чтобы запустить тест.</p>}
        </section>

        <button className="rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white" onClick={openShift}>
          Открыть смену
        </button>
      </div>
    </main>
  )
}

function ReadinessItem({ label, ready }: { label: string; ready: boolean }) {
  return (
    <li className="flex items-center gap-2 rounded-lg bg-slate-50 p-3">
      <span aria-label={ready ? 'Готово' : 'Не готово'}>{ready ? '✓' : '○'}</span>
      <span>{label}</span>
    </li>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-slate-600">{description}</p>
    </section>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WelcomeDashboard />
    </QueryClientProvider>
  )
}

export default App
