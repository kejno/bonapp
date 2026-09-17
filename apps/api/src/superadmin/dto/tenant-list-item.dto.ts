import { SubscriptionPlan } from '@prisma/client';

export class TenantListItemDto {
  id: string;
  name: string;
  slug: string;
  plan: SubscriptionPlan;
  isActive: boolean;
  trialEndsAt: Date | null;
  orderCount30d: number;
  monthlyRevenueByn: number;
}
