import { useAuthStore } from '../auth/auth.store';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export interface OrderDetails {
  id: string;
  dailyOrderNumber: number;
  status: string;
  totalAmountByn: string | number;
  createdAt: string;
}

export interface KitchenOrder {
  id: string;
  dailyOrderNumber: number;
  status: string;
  totalAmountByn: string | number;
  createdAt: string;
  isTest?: boolean;
}

export async function getOrders(): Promise<KitchenOrder[]> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_BASE}/orders`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Не удалось загрузить заказы');
  }
  return response.json() as Promise<KitchenOrder[]>;
}

export async function getOrder(id: string): Promise<OrderDetails> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_BASE}/orders/${encodeURIComponent(id)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Не удалось загрузить заказ');
  }
  return response.json() as Promise<OrderDetails>;
}
