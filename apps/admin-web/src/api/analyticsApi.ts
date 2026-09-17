const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export interface TopDish {
  menuItemId: string;
  name: string;
  quantitySold: number;
  totalRevenue: number;
}

export interface DailySummary {
  date: string;
  revenueTotal: number;
  avgCheck: number;
  orderCount: number;
  tableOccupancyPercent: number;
  posPingMs: number | null;
  topDishes: TopDish[];
}

export interface RevenueBucket {
  bucket: string;
  revenue: number;
  orderCount: number;
}

export type RevenueGranularity = 'hour' | 'day';

export interface PaymentMethodStats {
  method: 'OPLATI' | 'ERIP' | 'CARD' | 'CASH';
  amount: number;
  transactionCount: number;
}

export interface WaiterTips {
  waiterId: string;
  totalAmount: number;
  transactionCount: number;
}

export function fetchDailySummary(tenantId: string): Promise<DailySummary> {
  return apiFetch<DailySummary>(
    `/api/v1/admin/analytics/daily-summary?tenantId=${encodeURIComponent(tenantId)}`,
  );
}

export function fetchRevenue(
  tenantId: string,
  from: string,
  to: string,
  granularity: RevenueGranularity = 'hour',
): Promise<RevenueBucket[]> {
  const params = new URLSearchParams({ tenantId, from, to, granularity });
  return apiFetch<RevenueBucket[]>(`/api/v1/admin/analytics/revenue?${params}`);
}

export function fetchPaymentsSplit(tenantId: string): Promise<PaymentMethodStats[]> {
  return apiFetch<PaymentMethodStats[]>(
    `/api/v1/admin/analytics/payments-split?tenantId=${encodeURIComponent(tenantId)}`,
  );
}

export function fetchTips(tenantId: string): Promise<WaiterTips[]> {
  return apiFetch<WaiterTips[]>(
    `/api/v1/admin/analytics/tips?tenantId=${encodeURIComponent(tenantId)}`,
  );
}
