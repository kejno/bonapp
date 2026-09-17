export type PaymentMethodKey = 'OPLATI' | 'ERIP' | 'CARD' | 'CASH';

export interface PaymentMethodStatsDto {
  method: PaymentMethodKey;
  amount: number;
  transactionCount: number;
}
