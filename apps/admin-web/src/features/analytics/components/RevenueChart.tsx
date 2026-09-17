import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { Granularity } from '@bonapp/shared-types'
import { useRevenue } from '../hooks/useRevenue'

interface RevenueChartProps {
  from: Date
  to: Date
  granularity: Granularity
}

function formatTimestamp(ts: string, granularity: Granularity): string {
  const d = new Date(ts)
  if (granularity === 'hour') {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function RevenueChart({ from, to, granularity }: RevenueChartProps) {
  const { data, isLoading } = useRevenue(from, to, granularity)

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        Загрузка...
      </div>
    )
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        Нет данных за выбранный период
      </div>
    )
  }

  const chartData = data.data.map((point) => ({
    name: formatTimestamp(point.timestamp, data.granularity),
    revenue: point.revenue,
  }))

  return (
    <ResponsiveContainer width="100%" height={256}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value: number) => [`${value} BYN`, 'Выручка']} />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="#e0533c"
          fill="#e0533c"
          fillOpacity={0.1}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
