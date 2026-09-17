export type PlanType = 'TRIAL' | 'STARTER' | 'PRO' | 'ENTERPRISE';
export type TenantStatus = 'ACTIVE' | 'BLOCKED' | 'TRIAL';
export type UserRole = 'OWNER' | 'MANAGER' | 'STAFF' | 'SUPER_ADMIN';

export interface TenantSummaryDto {
  id: string;
  name: string;
  plan: PlanType;
  status: TenantStatus;
  trialEndsAt: string | null;
  revenueLastThirtyDays: number;
  createdAt: string;
}

export interface MrrMonthlyDto {
  month: string;
  mrr: number;
}

export interface PlatformMetricsDto {
  mrr: number;
  activeTenants: number;
  ordersToday: number;
  mrrHistory: MrrMonthlyDto[];
}

export interface TenantsListDto {
  data: TenantSummaryDto[];
  total: number;
}

export interface ChangePlanBodyDto {
  plan: PlanType;
}

export interface ExtendTrialBodyDto {
  extendDays: number;
}
