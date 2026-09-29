export abstract class PosOrderDispatcher {
  abstract enqueue(tenantId: string, orderId: string): Promise<void>;
}
