import { useAuthStore } from '../auth/auth.store';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export interface DiningArea {
  id: string;
  name: string;
  sortOrder: number;
}

export interface DiningTable {
  id: string;
  tableNumber: number;
  label: string | null;
  seatsCount: number;
  areaId: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'BILL_REQUESTED' | string;
  orders?: Array<{ id: string; status: string; totalAmountByn: string | number }>;
}

export interface TableInput {
  tableNumber: number;
  label?: string | null;
  seatsCount: number;
  areaId: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Не удалось выполнить запрос');
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const getAreas = () => request<DiningArea[]>('/admin/areas');
export const getTables = () => request<DiningTable[]>('/admin/tables');
export const createTable = (input: TableInput) => request<DiningTable>('/admin/tables', {
  method: 'POST', body: JSON.stringify(input),
});
export const updateTable = (id: string, input: TableInput) => request<DiningTable>(`/admin/tables/${encodeURIComponent(id)}`, {
  method: 'PUT', body: JSON.stringify(input),
});

export async function generateQrPdf(tableIds: string[]): Promise<Blob> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_BASE}/admin/tables/generate-qr-pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ tableIds }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Не удалось подготовить PDF');
  }
  return response.blob();
}
