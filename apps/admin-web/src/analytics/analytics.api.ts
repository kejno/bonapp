import { useAuthStore } from '../auth/auth.store';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export interface DailySummary {
  revenueByn: number;
  averageCheckByn: number;
  ordersCount: number;
  tablesOccupancyPercent: number;
  pos: { configured: boolean; pingMs: number | null };
  topDishes: { name: string; quantity: number }[];
}

export async function getDailySummary(): Promise<DailySummary> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_BASE}/admin/analytics/daily-summary`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error('Не удалось загрузить аналитику');
  return response.json() as Promise<DailySummary>;
}
