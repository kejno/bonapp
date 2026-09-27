CREATE TABLE "guests" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guests_tenant_id_phone_key" ON "guests"("tenant_id", "phone");
CREATE UNIQUE INDEX "guests_id_tenant_id_key" ON "guests"("id", "tenant_id");
CREATE INDEX "guests_tenant_id_idx" ON "guests"("tenant_id");
ALTER TABLE "guests" ADD CONSTRAINT "guests_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ADD COLUMN "guest_id" TEXT;
ALTER TABLE "orders" ADD CONSTRAINT "orders_guest_id_tenant_id_fkey"
  FOREIGN KEY ("guest_id", "tenant_id") REFERENCES "guests"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "orders_guest_id_tenant_id_idx" ON "orders"("guest_id", "tenant_id");

ALTER TABLE "guests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guests" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "guests"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ("tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true));
