export const FISCALIZE_QUEUE_NAME = 'fiscalize-payment';

export interface FiscalizeJobData {
  paymentId: string;
  tenantId: string;
  orderId: string;
  amount: number;
}
