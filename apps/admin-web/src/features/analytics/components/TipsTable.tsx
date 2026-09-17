import { useTips } from '../hooks/useTips'

interface TipsTableProps {
  from: Date
  to: Date
}

export function TipsTable({ from, to }: TipsTableProps) {
  const { data, isLoading } = useTips(from, to)

  if (isLoading) {
    return <div className="py-8 text-center text-gray-400">Загрузка...</div>
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className="py-8 text-center text-gray-400">
        Чаевые за выбранный период отсутствуют
      </div>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 text-left text-gray-500">
          <th className="pb-2 font-medium">Официант</th>
          <th className="pb-2 font-medium text-right">Столов</th>
          <th className="pb-2 font-medium text-right">Чаевые, BYN</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row) => (
          <tr
            key={row.waiterId}
            className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
          >
            <td className="py-2">{row.waiterName}</td>
            <td className="py-2 text-right">{row.tableCount}</td>
            <td className="py-2 text-right font-medium">{row.tipsTotal.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
