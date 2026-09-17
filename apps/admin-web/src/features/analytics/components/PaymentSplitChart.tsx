import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { usePaymentSplit } from '../hooks/usePaymentSplit'

const COLORS = ['#e0533c', '#2563eb', '#16a34a', '#ca8a04']

interface PaymentSplitChartProps {
  from: Date
  to: Date
}

export function PaymentSplitChart({ from, to }: PaymentSplitChartProps) {
  const { data, isLoading } = usePaymentSplit(from, to)

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        Загрузка...
      </div>
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        Нет данных за выбранный период
      </div>
    )
  }

  const chartData = data.items.map((item) => ({
    name: item.label,
    value: item.amount,
    percentage: item.percentage,
  }))

  return (
    <ResponsiveContainer width="100%" height={256}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          label={({ name, percentage }: { name: string; percentage: number }) =>
            `${name} (${percentage}%)`
          }
          labelLine={false}
        >
          {chartData.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, name: string) => [`${value} BYN`, name]}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
