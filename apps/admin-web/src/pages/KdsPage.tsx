import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { getOrders } from '../orders/orders.api';

const ACTIVE_STATUSES = new Set(['NEW', 'COOKING', 'READY']);

export default function KdsPage() {
  const [searchParams] = useSearchParams();
  const targetOrderId = searchParams.get('orderId');
  const orders = useQuery({ queryKey: ['kds-orders'], queryFn: getOrders, refetchInterval: 5000 });
  const activeOrders = (orders.data?.filter((order) => ACTIVE_STATUSES.has(order.status)) ?? [])
    .sort((first, second) => Number(second.id === targetOrderId) - Number(first.id === targetOrderId));

  return (
    <main className="min-h-svh bg-background p-6 text-on-background md:p-10">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div><p className="text-sm text-on-background/60">Рабочее место кухни</p><h1 className="mt-1 text-3xl font-semibold">KDS</h1></div>
        <Link to="/welcome" className="text-sm font-medium text-primary hover:underline">← На Welcome</Link>
      </header>
      <section aria-label="Активные заказы" className="mx-auto mt-8 grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orders.isPending && <p className="text-sm text-on-background/60">Загружаем заказы…</p>}
        {orders.isError && <p role="alert" className="text-sm text-error">Не удалось загрузить заказы. {orders.error.message}</p>}
        {!orders.isPending && !orders.isError && activeOrders.length === 0 && <div className="rounded-2xl border border-outline-variant bg-surface-card p-6 text-on-background/60">Активных заказов пока нет</div>}
        {activeOrders.map((order) => <Link key={order.id} to={`/orders/${encodeURIComponent(order.id)}`} className={`rounded-2xl border bg-surface-card p-6 hover:border-primary ${order.id === targetOrderId ? 'border-primary ring-2 ring-primary/30' : 'border-outline-variant'}`}>
          <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">Заказ №{order.dailyOrderNumber}</h2>{order.isTest && <span className="rounded-full bg-background px-3 py-1 text-xs">Тестовый</span>}</div>
          <p className="mt-3 text-sm">Статус: {order.status}</p>
          <p className="mt-1 text-sm text-on-background/60">{new Date(order.createdAt).toLocaleTimeString('ru-RU')}</p>
        </Link>)}
      </section>
    </main>
  );
}
