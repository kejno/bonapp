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

export interface RevenuePoint { period: string; revenueByn: number }
export interface PaymentSplit { method: 'OPLATI_QR' | 'ERIP_EPOS' | 'BANK_CARD' | 'CASH_TO_WAITER'; amountByn: number; transactionsCount: number }
export interface TipRow { waiterName: string; tipsByn: number; transactionsCount: number }
export interface ShiftReport { id: string; openedAt: string; closedAt: string | null; zReportNumber: number | null; ordersCount: number; revenueByn: number; payments: PaymentSplit[]; refundsByn: number }

async function analyticsRequest<T>(path: string): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_BASE}/admin/analytics/${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error('Не удалось загрузить аналитику');
  return response.json() as Promise<T>;
}

export const getRevenue = (from: string, to: string, granularity: string) => analyticsRequest<RevenuePoint[]>(`revenue?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&granularity=${granularity}`);
export const getPaymentsSplit = (from: string, to: string) => analyticsRequest<PaymentSplit[]>(`payments-split?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
export const getTips = (from: string, to: string) => analyticsRequest<TipRow[]>(`tips?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
export const getShiftReport = () => analyticsRequest<ShiftReport | null>('shift-report');
export async function exportTransactions(from: string, to: string) {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_BASE}/admin/analytics/transactions/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error('Не удалось скачать CSV');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'transactions.csv'; link.click(); URL.revokeObjectURL(url);
}
