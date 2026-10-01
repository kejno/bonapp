ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';
CREATE TYPE "PlanType" AS ENUM ('TRIAL', 'STARTER', 'PRO', 'ENTERPRISE');
ALTER TABLE "tenants" ADD COLUMN "plan" "PlanType" NOT NULL DEFAULT 'TRIAL';
CREATE TYPE "PaymentType" AS ENUM ('ORDER', 'SUBSCRIPTION');
ALTER TABLE "payments" ADD COLUMN "type" "PaymentType" NOT NULL DEFAULT 'ORDER';

DROP POLICY tenant_isolation ON "tables";
CREATE POLICY tenant_isolation ON "tables"
  AS PERMISSIVE FOR ALL TO PUBLIC
  USING ("qr_token" = current_setting('app.qr_token', true) OR "tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true)
    AND EXISTS (SELECT 1 FROM "dining_areas" WHERE "dining_areas"."id" = "tables"."area_id" AND "dining_areas"."tenant_id" = current_setting('app.current_tenant_id', true)));

DROP POLICY tenant_isolation ON "tenants";
CREATE POLICY tenant_isolation ON "tenants"
  AS PERMISSIVE FOR ALL TO PUBLIC
  USING (current_setting('app.is_superadmin', true) = 'true' OR "id" = current_setting('app.current_tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR "id" = current_setting('app.current_tenant_id', true));

DROP POLICY tenant_isolation ON "orders";
CREATE POLICY tenant_isolation ON "orders"
  AS PERMISSIVE FOR ALL TO PUBLIC
  USING (current_setting('app.is_superadmin', true) = 'true' OR "tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR "tenant_id" = current_setting('app.current_tenant_id', true));

DROP POLICY tenant_isolation ON "payments";
CREATE POLICY tenant_isolation ON "payments"
  AS PERMISSIVE FOR ALL TO PUBLIC
  USING (current_setting('app.is_superadmin', true) = 'true' OR "tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR "tenant_id" = current_setting('app.current_tenant_id', true));
