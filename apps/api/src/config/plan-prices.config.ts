import { registerAs } from '@nestjs/config';

export interface PlanPrices {
  TRIAL: number;
  STANDARD: number;
  PRO: number;
  ENTERPRISE: number;
}

export const planPricesConfig = registerAs('planPrices', (): PlanPrices => {
  const standard = Number(process.env.PLAN_PRICE_STANDARD);
  const pro = Number(process.env.PLAN_PRICE_PRO);
  const enterprise = Number(process.env.PLAN_PRICE_ENTERPRISE);

  if (!standard || !pro || !enterprise) {
    throw new Error(
      'Missing required plan price env vars: PLAN_PRICE_STANDARD, PLAN_PRICE_PRO, PLAN_PRICE_ENTERPRISE',
    );
  }

  return { TRIAL: 0, STANDARD: standard, PRO: pro, ENTERPRISE: enterprise };
});
