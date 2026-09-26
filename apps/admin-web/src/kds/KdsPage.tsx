import { Howl } from 'howler';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../auth/auth.store';
import {
  getKdsOrders,
  kdsSocketUrl,
  updateKdsStatus,
  type KdsOrder,
} from './kds.api';

const columns = [
  { status: 'NEW', label: 'Новые', color: 'border-amber-400' },
  { status: 'COOKING', label: 'Готовятся', color: 'border-blue-500' },
  { status: 'READY', label: 'Поданы', color: 'border-green-500' },
  { status: 'PAID', label: 'Оплачены', color: 'border-slate-400' },
];
const departmentLabels: Record<string, string> = {
  HOT: 'Горячий цех',
  COLD: 'Холодный цех',
  BAR: 'Бар',
};
const createdSound = new Howl({ src: ['/sounds/new-order.wav'], volume: 0.5 });

export default function KdsPage() {
  const token = useAuthStore((state) => state.accessToken);
  const role = useAuthStore((state) => state.user?.role);
  const queryClient = useQueryClient();
  const [department, setDepartment] = useState('ALL');
  const [dragged, setDragged] = useState<KdsOrder | null>(null);
  const query = useQuery({
    queryKey: ['kds-orders'],
    queryFn: getKdsOrders,
    refetchInterval: 30_000,
  });
  const mutation = useMutation({
    mutationFn: ({
      order,
      status,
      dept,
    }: {
      order: KdsOrder;
      status: string;
      dept?: string;
    }) => updateKdsStatus(order.id, status, dept),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['kds-orders'] }),
  });

  useEffect(() => {
    if (!token) return;
    const socket = io(kdsSocketUrl, { auth: { accessToken: token } });
    socket.on('order:created', () => {
      createdSound.play();
      void queryClient.invalidateQueries({ queryKey: ['kds-orders'] });
    });
    socket.on(
      'order:updated',
      () => void queryClient.invalidateQueries({ queryKey: ['kds-orders'] }),
    );
    return () => {
      socket.disconnect();
    };
  }, [token, queryClient]);

  const filtered = useMemo(
    () =>
      (query.data?.orders ?? []).map((order) => ({
        ...order,
        items:
          department === 'ALL'
            ? order.items
            : order.items.filter(
                (item) => item.kitchenDepartment === department,
              ),
      })),
    [query.data?.orders, department],
  );

  async function advance(order: KdsOrder) {
    const next =
      columns[
        columns.findIndex((column) => column.status === order.status) + 1
      ];
    if (!next) return;
    if (order.items.length === 0) {
      await updateKdsStatus(
        order.id,
        next.status,
        role === 'CHEF' ? query.data?.departments[0] : undefined,
      );
      await queryClient.invalidateQueries({ queryKey: ['kds-orders'] });
      return;
    }
    if (department === 'ALL' && query.data?.departments.length) {
      for (const dept of [
        ...new Set(order.items.map((item) => item.kitchenDepartment)),
      ]) {
        await updateKdsStatus(order.id, next.status, dept);
      }
      await queryClient.invalidateQueries({ queryKey: ['kds-orders'] });
      return;
    }
    mutation.mutate({
      order,
      status: next.status,
      dept: department === 'ALL' ? undefined : department,
    });
  }

  async function moveOrder(order: KdsOrder, status: string) {
    if (order.items.length === 0) {
      await updateKdsStatus(
        order.id,
        status,
        role === 'CHEF' ? query.data?.departments[0] : undefined,
      );
      await queryClient.invalidateQueries({ queryKey: ['kds-orders'] });
      return;
    }
    if (department === 'ALL' && role === 'CHEF') {
      for (const dept of [
        ...new Set(order.items.map((item) => item.kitchenDepartment)),
      ]) {
        await updateKdsStatus(order.id, status, dept);
      }
    } else {
      await updateKdsStatus(
        order.id,
        status,
        department === 'ALL' ? undefined : department,
      );
    }
    await queryClient.invalidateQueries({ queryKey: ['kds-orders'] });
  }

  return (
    <main className="min-h-svh bg-background text-on-background">
      <header className="flex h-16 items-center justify-between border-b border-outline-variant/40 bg-surface-card px-8">
        <h1 className="text-xl font-semibold">Live KDS</h1>
        <label className="flex items-center gap-3 text-sm">
          Цех
          <select
            aria-label="Фильтр по цеху"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            className="rounded-lg border border-outline-variant bg-surface-card px-3 py-2"
          >
            <option value="ALL">Всё</option>
            {(query.data?.departments ?? []).map((dept) => (
              <option key={dept} value={dept}>
                {departmentLabels[dept] ?? dept}
              </option>
            ))}
          </select>
        </label>
      </header>
      {query.isError && (
        <p role="alert" className="p-5 text-error">
          Нет доступа к KDS или не удалось загрузить заказы.
        </p>
      )}
      <div className="grid min-h-[calc(100svh-4rem)] grid-cols-4 gap-4 p-5">
        {columns.map((column) => (
          <section
            key={column.status}
            aria-label={column.label}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (
                dragged &&
                column.status !== 'PAID' &&
                columns.findIndex((entry) => entry.status === column.status) ===
                  columns.findIndex(
                    (entry) => entry.status === dragged.status,
                  ) +
                    1
              )
                void moveOrder(dragged, column.status);
              setDragged(null);
            }}
            className="min-w-0 rounded-xl bg-surface-card/70 p-3"
          >
            <h2 className="mb-3 flex items-center justify-between text-sm font-semibold">
              {column.label}
              <span className="rounded-full bg-background px-2 py-0.5 text-xs">
                {
                  filtered.filter((order) => order.status === column.status)
                    .length
                }
              </span>
            </h2>
            <div className="space-y-3">
              {filtered
                .filter((order) => order.status === column.status)
                .map((order) => (
                  <article
                    key={order.id}
                    draggable
                    onDragStart={() => setDragged(order)}
                    onDragEnd={() => setDragged(null)}
                    className={`rounded-xl border-l-4 ${column.color} bg-surface-card p-4 shadow-sm`}
                  >
                    <div className="flex items-start justify-between">
                      <strong className="text-lg">
                        #{String(order.dailyOrderNumber).padStart(3, '0')}
                      </strong>
                      <time className="font-mono text-sm tabular-nums">
                        {Math.max(
                          0,
                          Math.floor(
                            (Date.now() - new Date(order.createdAt).getTime()) /
                              60000,
                          ),
                        )}{' '}
                        мин
                      </time>
                    </div>
                    <p className="mt-1 text-sm">
                      Стол {order.table.label ?? order.table.tableNumber} ·{' '}
                      {order.assignedWaiter?.fullName ?? 'Без официанта'}
                    </p>
                    <ul className="my-3 space-y-2 border-t border-outline-variant/30 pt-3 text-sm">
                      {order.items.length ? (
                        order.items.map((item) => (
                          <li key={item.id}>
                            <span className="font-medium">
                              {item.quantity}× {item.name}
                            </span>
                            <span className="ml-2 text-xs text-on-background/55">
                              {departmentLabels[item.kitchenDepartment] ??
                                item.kitchenDepartment}
                            </span>
                            {item.itemComment && (
                              <p className="text-xs text-on-background/60">
                                {item.itemComment}
                              </p>
                            )}
                          </li>
                        ))
                      ) : (
                        <li className="text-sm text-on-background/55">
                          Позиции не добавлены
                        </li>
                      )}
                    </ul>
                    <button
                      disabled={
                        mutation.isPending ||
                        column.status === 'READY' ||
                        column.status === 'PAID'
                      }
                      onClick={() => void advance(order)}
                      className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
                    >
                      Bump
                    </button>
                  </article>
                ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
