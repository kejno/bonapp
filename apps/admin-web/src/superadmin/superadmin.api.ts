import { useAuthStore } from '../auth/auth.store';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
export type PlanType = 'TRIAL' | 'STARTER' | 'PRO' | 'ENTERPRISE';
export type TenantStatus = 'TRIAL' | 'ACTIVE' | 'BLOCKED';
export interface Overview { metrics: { subscriptionRevenueByn: number; activeRestaurants: number; qrOrdersToday: number }; growth: { month: string; subscriptionRevenueByn: number }[]; tenants: { id: string; name: string; plan: PlanType; status: TenantStatus; trialEndsAt: string | null; revenue30dByn: number }[] }

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_BASE}/superadmin/${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error('Не удалось выполнить запрос');
  return response.json() as Promise<T>;
}
export const getOverview = () => request<Overview>('overview');
export const changePlan = (id: string, plan: PlanType) => request(`tenants/${id}/plan`, 'PATCH', { plan });
export const setBlocked = (id: string, blocked: boolean) => request(`tenants/${id}/block`, 'PATCH', { blocked });
export const extendTrial = (id: string) => request(`tenants/${id}/trial`, 'PATCH', { extend_days: 30 });
