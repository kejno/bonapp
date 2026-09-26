import { useAuthStore } from '../auth/auth.store';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export interface KdsItem {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  status: string;
  kitchenDepartment: string;
  itemComment: string | null;
}

export interface KdsOrder {
  id: string;
  dailyOrderNumber: number;
  status: string;
  createdAt: string;
  table: { tableNumber: number; label: string | null };
  assignedWaiter: { fullName: string } | null;
  items: KdsItem[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error('Не удалось выполнить операцию KDS');
  return response.json() as Promise<T>;
}

export const getKdsOrders = () =>
  request<{ orders: KdsOrder[]; departments: string[] }>('/orders/kds');
export const updateKdsStatus = (
  orderId: string,
  status: string,
  department?: string,
) =>
  request<KdsOrder>(`/orders/${encodeURIComponent(orderId)}/kds-status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...(department ? { department } : {}) }),
  });

export const kdsSocketUrl = API_BASE.replace(/\/api\/v1\/?$/, '');
