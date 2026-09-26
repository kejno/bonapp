ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN';

CREATE TABLE "staff_shifts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cashier_id" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    CONSTRAINT "staff_shifts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_shifts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "staff_shifts_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "staff_shifts_tenant_id_closed_at_idx" ON "staff_shifts"("tenant_id", "closed_at");
ALTER TABLE "staff_shifts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_shifts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "staff_shifts_tenant_isolation" ON "staff_shifts"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true));
