UPDATE "tenants" SET "subscription_plan" = 'TRIAL' WHERE "subscription_plan" = 'free';
ALTER TABLE "tenants" ALTER COLUMN "subscription_plan" SET DEFAULT 'TRIAL';
