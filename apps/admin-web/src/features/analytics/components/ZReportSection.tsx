import { useZReport } from '../hooks/useZReport'

function formatDateTime(iso: string | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ZReportSection() {
  const { data, isLoading } = useZReport()

  if (isLoading) {
    return <div className="py-6 text-center text-gray-400">Загрузка...</div>
  }

  if (!data || data.status === 'not_found') {
    return <div className="py-6 text-center text-gray-400">Смены не найдены</div>
  }

  const totalRevenue = data.revenue.reduce((sum, r) => sum + r.amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex gap-1.5 items-center">
          <span className="text-gray-500">Статус:</span>
          <span
            className={`font-medium ${data.status === 'open' ? 'text-green-600' : 'text-gray-700'}`}
          >
            {data.status === 'open' ? 'Открыта' : 'Закрыта'}
          </span>
        </div>
        {data.openedAt && (
          <div className="flex gap-1.5 items-center">
            <span className="text-gray-500">Открыта:</span>
            <span>{formatDateTime(data.openedAt)}</span>
          </div>
        )}
        {data.closedAt && (
          <div className="flex gap-1.5 items-center">
            <span className="text-gray-500">Закрыта:</span>
            <span>{formatDateTime(data.closedAt)}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-gray-500 text-xs mb-1">Чеков</div>
          <div className="text-2xl font-semibold">{data.receiptCount}</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-gray-500 text-xs mb-1">Выручка</div>
          <div className="text-2xl font-semibold">{totalRevenue.toFixed(2)} BYN</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-gray-500 text-xs mb-1">Возвраты</div>
          <div className="text-2xl font-semibold text-bonapp-accent">
            {data.refundTotal.toFixed(2)} BYN
          </div>
        </div>
      </div>

      {data.revenue.length > 0 && (
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">
            Выручка по методам оплаты
          </div>
          <div className="space-y-1">
            {data.revenue.map((item) => (
              <div key={item.method} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.label}</span>
                <span className="font-medium">{item.amount.toFixed(2)} BYN</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
