import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../auth/auth.store';
import { getReadiness, openShift, simulateTestOrder } from '../welcome/welcome.api';

export default function WelcomePage() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const readiness = useQuery({ queryKey: ['welcome-readiness'], queryFn: getReadiness });
  const shiftMutation = useMutation({ mutationFn: openShift, onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['welcome-readiness'] }); navigate('/dashboard'); } });
  const testOrderMutation = useMutation({ mutationFn: simulateTestOrder, onSuccess: (order) => navigate(`/kds?orderId=${encodeURIComponent(order.id)}`) });
  const data = readiness.data;
  const checklist = [
    ['menuReady', 'Меню добавлено', '/menu'],
    ['tablesReady', 'Столы созданы', '/tables'],
    ['paymentsReady', 'Платежи настроены', null],
  ] as const;

  return (
    <main className="min-h-svh bg-background p-6 text-on-background md:p-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm text-on-background/60">Добро пожаловать</p><h1 className="mt-1 text-3xl font-semibold">{user?.fullName ?? 'Начнём работу'}</h1></div>
          <button className="rounded-lg bg-primary px-5 py-3 font-semibold text-on-primary disabled:opacity-50" disabled={shiftMutation.isPending || !data || data.hasActiveShift} onClick={() => shiftMutation.mutate()}>
            {data?.hasActiveShift ? 'Смена уже открыта' : 'Открыть смену'}
          </button>
        </header>
        {readiness.isError && <p role="alert" className="mt-5 text-sm text-error">Не удалось загрузить состояние ресторана. {readiness.error.message}</p>}
        {shiftMutation.isError && <p role="alert" className="mt-5 text-sm text-error">Не удалось открыть смену. {shiftMutation.error.message}</p>}
        {testOrderMutation.isError && <p role="alert" className="mt-5 text-sm text-error">Не удалось создать тестовый заказ. {testOrderMutation.error.message}</p>}

        <section aria-labelledby="readiness-title" className="mt-8 rounded-2xl border border-outline-variant bg-surface-card p-6">
          <h2 id="readiness-title" className="text-xl font-semibold">Готовность к работе</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {checklist.map(([key, label, href]) => {
              const content = <><input aria-label={label} type="checkbox" checked={data?.[key] ?? false} readOnly className="accent-primary" /><span>{label}</span></>;
              return <li key={key}>
                {href ? <Link to={href} className="flex items-center gap-3 rounded-xl border border-outline-variant p-4 hover:bg-background">{content}</Link> : <div className="flex items-center gap-3 rounded-xl border border-outline-variant p-4">{content}</div>}
              </li>;
            })}
          </ul>
        </section>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-outline-variant bg-surface-card p-6" aria-label="Заказы">
            <h2 className="text-xl font-semibold">Заказы</h2>
            <p className="mt-3 text-sm text-on-background/60">{data?.hasOrders ? 'Заказы уже поступали.' : 'Заказов пока нет'}</p>
          </section>
          <section className="rounded-2xl border border-outline-variant bg-surface-card p-6" aria-label="Смена">
            <h2 className="text-xl font-semibold">Активная смена</h2>
            <p className="mt-3 text-sm text-on-background/60">{data?.hasActiveShift ? 'Смена открыта' : 'Смена не открыта'}</p>
          </section>
        </div>

        <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-outline-variant bg-surface-card p-6">
          <div><h2 className="text-xl font-semibold">Тест QR</h2><p className="mt-2 text-sm text-on-background/60">Проверьте создание заказа и его появление в рабочем потоке.</p></div>
          <button className="rounded-lg border border-outline-variant px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50" disabled={!data?.canSimulateOrder || testOrderMutation.isPending} onClick={() => testOrderMutation.mutate()}>
            {testOrderMutation.isPending ? 'Создаём заказ…' : 'Симулировать тестовый заказ'}
          </button>
        </section>
        {readiness.isPending && <p className="mt-5 text-sm text-on-background/60">Загружаем состояние ресторана…</p>}
      </div>
    </main>
  );
}
