export type OrderStatus =
  | "new"
  | "accepted"
  | "preparing"
  | "ready"
  | "served"
  | "cancelled";

export interface OrderItemDto {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

export interface OrderDto {
  id: string;
  tenantId: string;
  tableId: string;
  status: OrderStatus;
  items: OrderItemDto[];
  totalPrice: number;
  createdAt: string;
  updatedAt: string;
}
