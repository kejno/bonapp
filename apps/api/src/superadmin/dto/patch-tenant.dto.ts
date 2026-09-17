import { SubscriptionPlan } from '@prisma/client';

export class PatchTenantDto {
  subscriptionPlan?: SubscriptionPlan;
  trialEndsAt?: string;
  isActive?: boolean;
}
