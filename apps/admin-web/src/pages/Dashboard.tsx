import { useQuery } from '@tanstack/react-query'
import {
  fetchDailySummary,
  fetchPaymentsSplit,
  fetchTips,
  type DailySummary,
  type PaymentMethodStats,
  type WaiterTips,
} from '../api/analyticsApi'

interface DashboardProps {
  tenantId: string
}

function StatCard({
  label,
  value,
  large,
}: {
  label: string
  value: string
  large?: boolean
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={large ? 'mt-1 text-3xl font-bold text-bonapp-accent' : 'mt-1 text-xl font-semibold'}>
        {value}
      </p>
    </div>
  )
}

function OccupancyBar({ percent }: { percent: number }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">Загрузка столов</p>
      <p className="mt-1 text-xl font-semibold">{percent}%</p>
      <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full bg-bonapp-accent transition-all"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  )
}

function TopDishesCard({ summary }: { summary: DailySummary }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-medium text-gray-500">ТОП блюд за смену</p>
      {summary.topDishes.length === 0 ? (
        <p className="text-sm text-gray-400">Нет данных</p>
      ) : (
        <ol className="space-y-2">
          {summary.topDishes.map((dish, i) => (
            <li key={dish.menuItemId} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="w-5 text-center font-semibold text-bonapp-accent">{i + 1}</span>
                <span className="truncate">{dish.name}</span>
              </span>
              <span className="ml-4 shrink-0 text-gray-500">
                {dish.quantitySold} шт · {dish.totalRevenue.toFixed(2)} BYN
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function PaymentsSplitCard({ stats }: { stats: PaymentMethodStats[] }) {
  const METHOD_LABEL: Record<string, string> = {
    OPLATI: 'Оплати',
    ERIP: 'ЕРИП',
    CARD: 'Карта',
    CASH: 'Наличные',
  }
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-medium text-gray-500">Способы оплаты</p>
      <ul className="space-y-2">
        {stats.map((s) => (
          <li key={s.method} className="flex items-center justify-between text-sm">
            <span>{METHOD_LABEL[s.method] ?? s.method}</span>
            <span className="text-gray-600">
              {s.amount.toFixed(2)} BYN · {s.transactionCount} опл.
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TipsCard({ tips }: { tips: WaiterTips[] }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-medium text-gray-500">Чаевые за смену</p>
      {tips.length === 0 ? (
        <p className="text-sm text-gray-400">Нет данных</p>
      ) : (
        <ul className="space-y-2">
          {tips.map((t) => (
            <li key={t.waiterId} className="flex items-center justify-between text-sm">
              <span className="truncate text-gray-700">{t.waiterId}</span>
              <span className="ml-4 shrink-0 text-gray-600">
                {t.totalAmount.toFixed(2)} BYN · {t.transactionCount} шт.
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PosStatusCard({ pingMs }: { pingMs: number | null }) {
  const connected = pingMs !== null
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">Статус POS</p>
      <p className={`mt-1 text-sm font-semibold ${connected ? 'text-green-600' : 'text-gray-400'}`}>
        {connected ? `Подключён · ${pingMs} мс` : 'Нет данных'}
      </p>
    </div>
  )
}

export function Dashboard({ tenantId }: DashboardProps) {
  const summaryQuery = useQuery({
    queryKey: ['analytics', 'daily-summary', tenantId],
    queryFn: () => fetchDailySummary(tenantId),
    refetchInterval: 30_000,
  })

  const paymentsQuery = useQuery({
    queryKey: ['analytics', 'payments-split', tenantId],
    queryFn: () => fetchPaymentsSplit(tenantId),
    refetchInterval: 30_000,
  })

  const tipsQuery = useQuery({
    queryKey: ['analytics', 'tips', tenantId],
    queryFn: () => fetchTips(tenantId),
    refetchInterval: 30_000,
  })

  const isLoading = summaryQuery.isLoading || paymentsQuery.isLoading || tipsQuery.isLoading
  const hasError = summaryQuery.isError || paymentsQuery.isError || tipsQuery.isError

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-bonapp-bg">
        <p className="text-gray-400">Загрузка дашборда…</p>
      </div>
    )
  }

  if (hasError || !summaryQuery.data || !paymentsQuery.data || !tipsQuery.data) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-bonapp-bg">
        <p className="text-red-500">Ошибка загрузки данных</p>
      </div>
    )
  }

  const summary = summaryQuery.data
  const payments = paymentsQuery.data
  const tips = tipsQuery.data

  return (
    <div className="min-h-svh bg-bonapp-bg p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Дашборд</h1>
          <p className="text-sm text-gray-500">Смена: {summary.date}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Выручка за смену"
            value={`${summary.revenueTotal.toFixed(2)} BYN`}
            large
          />
          <StatCard
            label="Средний чек"
            value={`${summary.avgCheck.toFixed(2)} BYN`}
          />
          <StatCard
            label="Заказов"
            value={String(summary.orderCount)}
          />
          <PosStatusCard pingMs={summary.posPingMs} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <OccupancyBar percent={summary.tableOccupancyPercent} />
          <TopDishesCard summary={summary} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PaymentsSplitCard stats={payments} />
          <TipsCard tips={tips} />
        </div>
      </div>
    </div>
  )
}
