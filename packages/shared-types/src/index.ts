export const PAYMENT_METHOD = {
  OPLATI: 'OPLATI',
  ERIP: 'ERIP',
  CARD: 'CARD',
  CASH: 'CASH',
} as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

export const GRANULARITY = {
  HOUR: 'hour',
  DAY: 'day',
  WEEK: 'week',
} as const;
export type Granularity = (typeof GRANULARITY)[keyof typeof GRANULARITY];

export type DateRangePreset = 'today' | 'week' | 'month' | 'custom';

export interface RevenueDataPoint {
  timestamp: string;
  revenue: number;
}

export interface RevenueResponse {
  data: RevenueDataPoint[];
  granularity: Granularity;
}

export interface PaymentSplitItem {
  method: PaymentMethod;
  label: string;
  amount: number;
  percentage: number;
}

export interface PaymentSplitResponse {
  items: PaymentSplitItem[];
  total: number;
}

export interface TipRow {
  waiterId: string;
  waiterName: string;
  tableCount: number;
  tipsTotal: number;
}

export interface TipsResponse {
  rows: TipRow[];
}

export interface ZReportRevenueItem {
  method: PaymentMethod;
  label: string;
  amount: number;
}

export interface ZReportResponse {
  status: 'open' | 'closed' | 'not_found';
  shiftId?: string;
  openedAt?: string;
  closedAt?: string;
  receiptCount: number;
  revenue: ZReportRevenueItem[];
  refundTotal: number;
}
