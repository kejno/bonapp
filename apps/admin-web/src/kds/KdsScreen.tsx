import { useQuery } from '@tanstack/react-query'
import { getKdsOrders } from './api'
import { KdsBoard } from './KdsBoard'

export function KdsScreen() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['kds', 'orders'],
    queryFn: getKdsOrders,
  })

  if (isLoading) {
    return <main className="flex min-h-svh items-center justify-center bg-bonapp-bg text-slate-600">Загрузка заказов…</main>
  }

  if (isError) {
    return <main className="flex min-h-svh items-center justify-center bg-bonapp-bg text-red-700">Не удалось загрузить заказы KDS.</main>
  }

  return <KdsBoard initialOrders={data ?? []} />
}
