CREATE TYPE "PosProvider" AS ENUM ('IIKO', 'RKEEPER');

CREATE TABLE "pos_integration_configs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "provider" "PosProvider" NOT NULL,
  "config" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pos_integration_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_integration_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "pos_integration_configs_tenant_id_provider_key" ON "pos_integration_configs"("tenant_id", "provider");
CREATE INDEX "pos_integration_configs_tenant_id_idx" ON "pos_integration_configs"("tenant_id");
ALTER TABLE "pos_integration_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_integration_configs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pos_integration_configs"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true));
