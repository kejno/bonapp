CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'OWNER', 'MANAGER', 'WAITER', 'CHEF', 'CASHIER');
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLOSED');

ALTER TABLE "Tenant" RENAME TO "tenants";
ALTER TABLE "User" RENAME TO "users";

ALTER TABLE "tenants" RENAME COLUMN "logoUrl" TO "logo_url";
ALTER TABLE "tenants" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "users" RENAME COLUMN "tenantId" TO "tenant_id";
ALTER TABLE "tenants" RENAME CONSTRAINT "Tenant_pkey" TO "tenants_pkey";
ALTER TABLE "users" RENAME CONSTRAINT "User_pkey" TO "users_pkey";

ALTER TABLE "tenants"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "legal_name" TEXT,
  ADD COLUMN "unp" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Europe/Minsk',
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'BYN',
  ADD COLUMN "brand_color" TEXT,
  ADD COLUMN "dine_in" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "takeaway" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "delivery" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "trial_ends_at" TIMESTAMP(3),
  ADD COLUMN "subscription_plan" TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "tenants" SET "slug" = "id" WHERE "slug" IS NULL;
ALTER TABLE "tenants" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "tenants" ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "users"
  ADD COLUMN "password_hash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "full_name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "pin_code" TEXT,
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "last_login_at" TIMESTAMP(3),
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole" USING (
  CASE "role"
    WHEN 'SUPER_ADMIN' THEN 'SUPER_ADMIN'
    WHEN 'OWNER' THEN 'OWNER'
    WHEN 'ADMIN' THEN 'MANAGER'
    WHEN 'MANAGER' THEN 'MANAGER'
    WHEN 'WAITER' THEN 'WAITER'
    WHEN 'CHEF' THEN 'CHEF'
    WHEN 'KITCHEN' THEN 'CHEF'
    WHEN 'CASHIER' THEN 'CASHIER'
    ELSE 'WAITER'
  END
)::"UserRole";
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "full_name" DROP DEFAULT;

CREATE TABLE "dining_areas" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dining_areas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tables" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "area_id" TEXT NOT NULL,
  "table_number" INTEGER NOT NULL,
  "label" TEXT,
  "seats_count" INTEGER NOT NULL DEFAULT 1,
  "qr_token" TEXT NOT NULL,
  "pos_table_id" TEXT,
  "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "dining_areas" ALTER COLUMN "updated_at" DROP DEFAULT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'User_email_key' AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE "users" DROP CONSTRAINT "User_email_key";
  ELSIF to_regclass('"User_email_key"') IS NOT NULL THEN
    DROP INDEX "User_email_key";
  END IF;
END $$;
DROP INDEX "User_tenantId_idx";
ALTER TABLE "users" DROP CONSTRAINT "User_tenantId_fkey";

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");
CREATE INDEX "dining_areas_tenant_id_idx" ON "dining_areas"("tenant_id");
CREATE UNIQUE INDEX "tables_qr_token_key" ON "tables"("qr_token");
CREATE UNIQUE INDEX "tables_tenant_id_table_number_key" ON "tables"("tenant_id", "table_number");
CREATE INDEX "idx_tables_qr_token" ON "tables"("qr_token");
CREATE INDEX "tables_tenant_id_idx" ON "tables"("tenant_id");
CREATE INDEX "tables_area_id_idx" ON "tables"("area_id");

ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dining_areas" ADD CONSTRAINT "dining_areas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tables" ADD CONSTRAINT "tables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tables" ADD CONSTRAINT "tables_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "dining_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
