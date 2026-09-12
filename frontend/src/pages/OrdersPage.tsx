import type { CSSProperties } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/axios';

type OrderStatus = 'NEW' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

interface OrderItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  tableId: string;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number;
  createdAt: string;
}

interface PaginatedOrders {
  data: Order[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Новый',
  IN_PROGRESS: 'В работе',
  DONE: 'Выполнен',
  CANCELLED: 'Отменён',
};

const STATUS_ACTIONS: Record<OrderStatus, { label: string; next: OrderStatus }[]> = {
  NEW: [
    { label: 'Принять в работу', next: 'IN_PROGRESS' },
    { label: 'Отменить', next: 'CANCELLED' },
  ],
  IN_PROGRESS: [
    { label: 'Выполнен', next: 'DONE' },
    { label: 'Отменить', next: 'CANCELLED' },
  ],
  DONE: [],
  CANCELLED: [],
};

const FILTER_OPTIONS: { value: '' | OrderStatus; label: string }[] = [
  { value: '', label: 'Все' },
  { value: 'NEW', label: 'Новые' },
  { value: 'IN_PROGRESS', label: 'В работе' },
  { value: 'DONE', label: 'Выполненные' },
  { value: 'CANCELLED', label: 'Отменённые' },
];

const cardBase: CSSProperties = {
  border: '1px solid #e5e4e7',
  borderRadius: 6,
  padding: 12,
  marginBottom: 12,
};

const cardNew: CSSProperties = {
  ...cardBase,
  borderLeft: '4px solid #f59e0b',
  background: '#fffbeb',
};

export interface OrderCardProps {
  order: Order;
  updatingId: string | null;
  onStatusChange: (orderId: string, next: OrderStatus) => void;
}

export function OrderCard({ order, updatingId, onStatusChange }: OrderCardProps) {
  const isNew = order.status === 'NEW';
  const actions = STATUS_ACTIONS[order.status];
  const isUpdating = updatingId === order.id;

  const createdAt = new Date(order.createdAt).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div style={isNew ? cardNew : cardBase}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong>Стол: {order.tableId}</strong>
        <span style={{ color: '#666', fontSize: '0.875rem' }}>{createdAt}</span>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
        {order.items.map((item) => (
          <li key={item.menuItemId} style={{ fontSize: '0.875rem' }}>
            {item.name} × {item.quantity}
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>{order.totalAmount.toFixed(2)} ₽</span>
        <span
          style={{
            fontSize: '0.8rem',
            padding: '2px 8px',
            borderRadius: 12,
            background: isNew ? '#fef3c7' : '#f3f4f6',
            color: isNew ? '#92400e' : '#374151',
          }}
        >
          {STATUS_LABELS[order.status]}
        </span>
      </div>
      {actions.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {actions.map((action) => (
            <button
              key={action.next}
              type="button"
              disabled={isUpdating}
              onClick={() => onStatusChange(order.id, action.next)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') as OrderStatus | null;

  const fetchOrders = useCallback(async () => {
    try {
      const params: Record<string, string> = { limit: '50' };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get<PaginatedOrders>('/orders', { params });
      setOrders(data.data);
    } catch {
      setError('Ошибка загрузки заказов');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    void fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchOrders();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  async function handleStatusChange(orderId: string, next: OrderStatus) {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: next } : o)));
    setUpdatingId(orderId);
    try {
      await api.patch(`/orders/${orderId}/status`, { status: next });
    } catch {
      // revert by refetching on error
    } finally {
      setUpdatingId(null);
      void fetchOrders();
    }
  }

  function handleFilterChange(value: string) {
    if (value) {
      setSearchParams({ status: value });
    } else {
      setSearchParams({});
    }
  }

  const activeFilter = statusFilter ?? '';

  return (
    <div>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}
      >
        <h2 style={{ margin: 0 }}>Заказы</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleFilterChange(opt.value)}
              style={{
                fontWeight: activeFilter === opt.value ? 700 : undefined,
                textDecoration: activeFilter === opt.value ? 'underline' : undefined,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {loading && <p>Загрузка...</p>}

      {!loading && !error && orders.length === 0 && <p>Заказов нет.</p>}

      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          updatingId={updatingId}
          onStatusChange={handleStatusChange}
        />
      ))}
    </div>
  );
}
