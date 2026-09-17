import { DateRangePicker } from './components/DateRangePicker'
import { RevenueChart } from './components/RevenueChart'
import { PaymentSplitChart } from './components/PaymentSplitChart'
import { TipsTable } from './components/TipsTable'
import { ZReportSection } from './components/ZReportSection'
import { useDateRange } from './hooks/useDateRange'
import { apiUrl } from '../../api/client'

export function AnalyticsPage() {
  const { preset, from, to, granularity, setPreset, setCustomRange } = useDateRange()

  const exportUrl = apiUrl(
    `/api/v1/admin/analytics/transactions/export?from=${from.toISOString()}&to=${to.toISOString()}`,
  )

  return (
    <div className="min-h-screen bg-bonapp-bg">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-gray-900">Аналитика</h1>
          <DateRangePicker
            preset={preset}
            from={from}
            to={to}
            onPresetChange={setPreset}
            onCustomRangeChange={setCustomRange}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Выручка</h2>
            <RevenueChart from={from} to={to} granularity={granularity} />
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Методы оплаты</h2>
            <PaymentSplitChart from={from} to={to} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Чаевые</h2>
          <TipsTable from={from} to={to} />
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Z-отчёт</h2>
          <ZReportSection />
        </div>

        <div className="flex justify-end">
          <a
            href={exportUrl}
            download="transactions.csv"
            className="px-4 py-2 bg-bonapp-accent text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Скачать CSV
          </a>
        </div>
      </div>
    </div>
  )
}
