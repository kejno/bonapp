import { useAuthStore } from '../auth/auth.store';
import type { PosType } from './pos-validation';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

async function request<T>(path: string, body?: unknown): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_BASE}/admin/tenant/onboarding/step2${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(result.message ?? 'Не удалось выполнить запрос');
  }
  return response.json() as Promise<T>;
}

export interface ImportStatus { status: string; imported?: number; total?: number; message?: string; failed?: Array<{ name: string; reason: string }> }
export const savePos = (input: { posType: PosType; apiKey: string; url: string }) => request<{ posType: string }>('/pos', input);
export const checkPos = (input: { posType: PosType; apiKey: string; url: string }) => request<{ pingMs: number; productCount: number }>('/pos-check', input);
export const startImport = () => request<{ jobId: string }>('/import', {});
export const retryImport = () => request<{ jobId: string }>('/import/retry', {});
export const getImportStatus = () => request<ImportStatus>('/import');
