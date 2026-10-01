import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getDailySummary } from '../analytics/analytics.api';
import { useAuthStore } from '../auth/auth.store';

const money = (amount: number) => `${amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BYN`;

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const isWaiter = user?.role === 'WAITER';
  const canOpenKds = ['CHEF', 'OWNER', 'MANAGER', 'WAITER'].includes(user?.role ?? '');
  const summary = useQuery({ queryKey: ['analytics', 'daily-summary'], queryFn: getDailySummary, refetchInterval: 60_000, enabled: !isWaiter });
  const data = summary.data;
  const topDishes = data?.topDishes ?? [];

  return (
    <main className="min-h-svh bg-background p-6 text-on-background md:p-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="text-3xl font-semibold">Добро пожаловать{user ? `, ${user.fullName}` : ''}</h1><p className="mt-1 text-sm text-on-background/60">Панель ресторатора · Сводка за сегодня</p></div>
          <button onClick={clearAuth} className="text-sm text-primary hover:underline">Выйти</button>
        </header>
        {!isWaiter && summary.isError && <p role="alert" className="mt-6 rounded-xl border border-error p-4">{summary.error.message}</p>}
        {!isWaiter && summary.isPending && <p className="mt-6 text-sm text-on-background/60">Загружаем аналитику…</p>}
        {!isWaiter && data && <>
          <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Показатели за сегодня">
            <article className="rounded-2xl bg-primary p-6 text-on-primary sm:col-span-2"><p className="text-sm opacity-80">Выручка</p><p className="mt-3 text-4xl font-semibold">{money(data.revenueByn ?? 0)}</p></article>
            <article className="rounded-2xl border border-outline-variant bg-surface-card p-6"><p className="text-sm text-on-background/60">Средний чек</p><p className="mt-3 text-2xl font-semibold">{money(data.averageCheckByn ?? 0)}</p></article>
            <article className="rounded-2xl border border-outline-variant bg-surface-card p-6"><p className="text-sm text-on-background/60">Заказы</p><p className="mt-3 text-2xl font-semibold">{data.ordersCount ?? 0}</p></article>
          </section>
          <section className="mt-4 grid gap-4 md:grid-cols-2">
            <article className="rounded-2xl border border-outline-variant bg-surface-card p-6">
              <div className="flex justify-between"><h2 className="font-semibold">Загрузка столов</h2><span>{data.tablesOccupancyPercent}%</span></div>
              <div role="progressbar" aria-label="Загрузка столов" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.tablesOccupancyPercent} className="mt-4 h-3 overflow-hidden rounded-full bg-outline-variant"><div className="h-full rounded-full bg-primary" style={{ width: `${data.tablesOccupancyPercent}%` }} /></div>
            </article>
            <article className="rounded-2xl border border-outline-variant bg-surface-card p-6"><h2 className="font-semibold">Интеграция POS</h2><p className="mt-3">{data.pos?.configured ? 'Подключена' : 'Не настроена'}{data.pos?.pingMs != null ? ` · ${data.pos.pingMs} мс` : ''}</p></article>
            <article className="rounded-2xl border border-outline-variant bg-surface-card p-6 md:col-span-2"><h2 className="font-semibold">Популярные блюда</h2>{topDishes.length ? <ol className="mt-4 grid gap-2 sm:grid-cols-2">{topDishes.map((dish, index) => <li key={`${dish.name}-${index}`} className="flex justify-between rounded-lg bg-background p-3"><span>{index + 1}. {dish.name}</span><span>{dish.quantity} шт.</span></li>)}</ol> : <p className="mt-3 text-sm text-on-background/60">Продаж пока нет</p>}</article>
          </section>
        </>}
        <nav className="mt-8 flex flex-wrap gap-4 text-sm">
          {!isWaiter && <Link to="/menu" className="text-primary hover:underline">Каталог меню</Link>}
          {!isWaiter && <Link to="/analytics" className="text-primary hover:underline">Аналитика и выручка</Link>}
          {canOpenKds && <Link to="/kds" className="text-primary hover:underline">Live KDS</Link>}
          {!isWaiter && <Link to="/settings" className="text-primary hover:underline">Настройки заведения</Link>}
          <Link to="/tables" className="text-primary hover:underline">{isWaiter ? 'Мои столы' : 'Схема зала'}</Link>
        </nav>
      </div>
    </main>
  );
}
