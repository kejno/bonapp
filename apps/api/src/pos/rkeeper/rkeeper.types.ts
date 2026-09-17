export interface RKeeperCategory {
  id: string;
  name: string;
  isDeleted?: boolean;
}

export interface RKeeperProduct {
  id: string;
  name: string;
  categoryId?: string;
  price: number;
  isDeleted?: boolean;
}

export interface RKeeperOrderItemPayload {
  productId: string;
  amount: number;
  price: number;
}

export interface RKeeperCreateOrderPayload {
  items: RKeeperOrderItemPayload[];
}

export interface RKeeperOrderResponse {
  id: string;
}
