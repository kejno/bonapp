export interface RKeeperOrderItem {
  posItemId: string;
  quantity: number;
  unitPriceByn: number;
}

export interface RKeeperOrder {
  id: string;
  dailyOrderNumber: number;
  comment: string | null;
  totalAmountByn: number;
  items: RKeeperOrderItem[];
}

export function buildRKeeperOrderPayload(order: RKeeperOrder) {
  return {
    externalId: order.id,
    number: order.dailyOrderNumber,
    comment: order.comment ?? '',
    totalAmount: order.totalAmountByn,
    items: order.items.map((item) => ({
      productId: item.posItemId,
      quantity: item.quantity,
      price: item.unitPriceByn,
    })),
  };
}

export function buildIikoOrderPayload(order: RKeeperOrder, organizationId: string, terminalGroupId: string) {
  return {
    organizationId,
    terminalGroupId,
    order: {
      externalNumber: order.id,
      comment: order.comment ?? '',
      items: order.items.map((item) => ({
        type: 'Product',
        productId: item.posItemId,
        amount: item.quantity,
        price: item.unitPriceByn,
      })),
    },
  };
}
