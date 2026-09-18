export interface FiscalizePaymentParams {
  paymentId: string;
  tenantId: string;
  orderId: string;
  amount: number;
  sknoSerial: string;
  sknoUnp: string;
}

export interface ZReport {
  reportNumber: string;
  closedAt: string;
  totalAmount: number;
  receiptCount: number;
  raw?: unknown;
}

export const SKNO_API_SERVICE = Symbol('SKNO_API_SERVICE');

export interface ISknoApiService {
  fiscalizePayment(params: FiscalizePaymentParams): Promise<string>;
  openShift(sknoSerial: string, sknoUnp: string): Promise<void>;
  closeShift(sknoSerial: string, sknoUnp: string): Promise<ZReport>;
}
