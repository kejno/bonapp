ALTER TABLE "tenants" ADD COLUMN "daily_order_number" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "shifts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "cashier_id" TEXT NOT NULL,
  "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  CONSTRAINT "shifts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shifts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "shifts_cashier_id_tenant_id_fkey" FOREIGN KEY ("cashier_id", "tenant_id") REFERENCES "users"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "shifts_id_tenant_id_key" ON "shifts"("id", "tenant_id");
CREATE INDEX "shifts_tenant_id_status_idx" ON "shifts"("tenant_id", "status");
CREATE UNIQUE INDEX "shifts_one_open_per_tenant" ON "shifts"("tenant_id") WHERE "status" = 'OPEN';

CREATE TABLE "shift_reports" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "shift_id" TEXT NOT NULL,
  "cashier_id" TEXT NOT NULL,
  "opened_at" TIMESTAMP(3) NOT NULL,
  "closed_at" TIMESTAMP(3) NOT NULL,
  "total_amount" DECIMAL(12,2) NOT NULL,
  "order_count" INTEGER NOT NULL,
  CONSTRAINT "shift_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shift_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "shift_reports_shift_id_tenant_id_fkey" FOREIGN KEY ("shift_id", "tenant_id") REFERENCES "shifts"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "shift_reports_shift_id_key" ON "shift_reports"("shift_id");
CREATE INDEX "shift_reports_tenant_id_idx" ON "shift_reports"("tenant_id");

ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shifts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "shifts" AS PERMISSIVE FOR ALL TO PUBLIC
  USING ("tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true));
ALTER TABLE "shift_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_reports" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "shift_reports" AS PERMISSIVE FOR ALL TO PUBLIC
  USING ("tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true));
CREATE UNIQUE INDEX "shift_reports_shift_id_tenant_id_key" ON "shift_reports"("shift_id", "tenant_id");
