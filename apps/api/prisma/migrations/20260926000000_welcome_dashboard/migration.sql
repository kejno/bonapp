ALTER TABLE "orders" ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "shifts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "opened_by_id" TEXT NOT NULL,
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  CONSTRAINT "shifts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shifts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "shifts_opened_by_id_tenant_id_fkey" FOREIGN KEY ("opened_by_id", "tenant_id") REFERENCES "users"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "shifts_tenant_id_closed_at_idx" ON "shifts"("tenant_id", "closed_at");
CREATE UNIQUE INDEX "shifts_one_open_per_tenant_idx" ON "shifts"("tenant_id") WHERE "closed_at" IS NULL;
ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shifts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "shifts"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true));
