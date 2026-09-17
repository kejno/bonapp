export type StaffRole = 'WAITER' | 'CASHIER' | 'MANAGER' | 'ADMIN';

export interface StaffMemberDto {
  id: string;
  name: string;
  role: StaffRole;
  phone: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface ShiftDto {
  id: string;
  openedAt: string;
  closedAt: string | null;
  cashier: { id: string; name: string };
  ordersCount: number;
}

export interface CloseShiftResultDto {
  id: string;
  openedAt: string;
  closedAt: string;
  cashier: { id: string; name: string };
  ordersCount: number;
  totalRevenue: number;
}

export interface CreateStaffRequest {
  name: string;
  role: StaffRole;
  phone: string;
  temporaryPassword: string;
}

export interface UpdateStaffRequest {
  name?: string;
  role?: StaffRole;
  phone?: string;
}

export interface OpenShiftRequest {
  cashierId: string;
}
