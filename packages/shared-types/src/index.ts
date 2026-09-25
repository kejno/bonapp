export const OrderStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  COOKING: 'COOKING',
  READY: 'READY',
  SERVED: 'SERVED',
  CANCELLED: 'CANCELLED',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const UserRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  WAITER: 'WAITER',
  CASHIER: 'CASHIER',
  KITCHEN: 'KITCHEN',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  fullName: string;
}

export const PaymentMethod = {
  CASH: 'CASH',
  CARD: 'CARD',
  OPLATI: 'OPLATI',
  ERIP: 'ERIP',
} as const;

export type PaymentMethod =
  (typeof PaymentMethod)[keyof typeof PaymentMethod];

export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'OUT_OF_SERVICE';

export interface TenantDto {
  id: string;
  name: string;
  createdAt: string;
}

export interface TableDto {
  id: string;
  tenantId: string;
  number: number;
  name: string;
  capacity: number;
  status: TableStatus;
}

export interface OrderItemDto {
  menuItemId: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderDto {
  id: string;
  tenantId: string;
  tableId: string;
  status: OrderStatus;
  items: OrderItemDto[];
  totalAmount: number;
  paymentMethod: PaymentMethod;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItemDto {
  id: string;
  tenantId: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
}
