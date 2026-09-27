import { useAuthStore } from '../auth/auth.store';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export interface Readiness {
  menuReady: boolean;
  tablesReady: boolean;
  paymentsReady: boolean;
  hasOrders: boolean;
  hasActiveShift: boolean;
  canSimulateOrder: boolean;
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Не удалось выполнить запрос');
  }
  return response.json() as Promise<T>;
}

export const getReadiness = () => request<Readiness>('/admin/readiness');
export const openShift = () => request<{ id: string }>('/admin/shifts/open', 'POST');
export const simulateTestOrder = () => request<{ id: string }>('/orders', 'POST', { isTest: true });
