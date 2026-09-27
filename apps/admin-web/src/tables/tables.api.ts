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
  orders?: Array<{ id: string; status: string; totalAmountByn: string | number; guestSessionId: string | null }>;
}

export interface TableInput {
  tableNumber: number;
  label?: string | null;
  seatsCount: number;
  areaId: string;
}

export interface BulkTableInput {
  areaId: string;
  startNumber: number;
  count: number;
  seatsCount: number;
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
export const createArea = (name: string) => request<DiningArea>('/admin/areas', {
  method: 'POST', body: JSON.stringify({ name }),
});
export const getTables = () => request<DiningTable[]>('/admin/tables');
export const createTablesBulk = (input: BulkTableInput) => request<DiningTable[]>('/admin/tables/bulk', {
  method: 'POST', body: JSON.stringify(input),
});
export interface TableQrPreview { tableNumber: number; restaurantName: string; url: string; qrDataUrl: string }
export const getTableQrPreview = (id: string) => request<TableQrPreview>(`/admin/tables/${encodeURIComponent(id)}/qr-preview`);
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
  if (response.status === 202) {
    const job = await response.json() as { statusUrl: string };
    const statusUrl = new URL(job.statusUrl, API_BASE);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      const statusResponse = await fetch(statusUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!statusResponse.ok) throw new Error('Не удалось проверить готовность PDF');
      const result = await statusResponse.json() as { status: string; downloadUrl?: string; error?: string };
      if (result.status === 'failed') throw new Error(result.error ?? 'Не удалось подготовить PDF');
      if (result.status === 'ready' && result.downloadUrl) {
        const fileResponse = await fetch(new URL(result.downloadUrl, API_BASE), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!fileResponse.ok) throw new Error('Не удалось скачать PDF');
        return fileResponse.blob();
      }
    }
    throw new Error('Формирование PDF занимает слишком много времени');
  }
  return response.blob();
}
