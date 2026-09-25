import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getOrder } from '../orders/orders.api';

export default function OrderPage() {
  const { orderId = '' } = useParams();
  const orderQuery = useQuery({ queryKey: ['order', orderId], queryFn: () => getOrder(orderId), enabled: Boolean(orderId) });

  return (
    <main className="min-h-svh bg-background p-6 text-on-background md:p-10">
      <div className="mx-auto max-w-3xl">
        <Link to="/tables" className="text-sm font-medium text-primary hover:underline">← К схеме зала</Link>
        <h1 className="mt-5 text-3xl font-semibold">Заказ</h1>
        {orderQuery.isPending && <p className="mt-5 text-sm text-on-background/60">Загружаем заказ…</p>}
        {orderQuery.isError && <p role="alert" className="mt-5 text-sm text-error">Не удалось загрузить заказ. {orderQuery.error.message}</p>}
        {orderQuery.data && <section aria-label="Детали заказа" className="mt-6 rounded-2xl border border-outline-variant bg-surface-card p-6">
          <h2 className="text-xl font-semibold">Заказ №{orderQuery.data.dailyOrderNumber}</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="text-on-background/60">Идентификатор</dt><dd>{orderQuery.data.id}</dd></div>
            <div><dt className="text-on-background/60">Статус</dt><dd>{orderQuery.data.status}</dd></div>
            <div><dt className="text-on-background/60">Сумма</dt><dd>{orderQuery.data.totalAmountByn} BYN</dd></div>
            <div><dt className="text-on-background/60">Создан</dt><dd>{new Date(orderQuery.data.createdAt).toLocaleString('ru-RU')}</dd></div>
          </dl>
        </section>}
      </div>
    </main>
  );
}
