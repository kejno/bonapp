-- Orders and payments are tenant-owned.

ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "orders"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ("tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true));

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "payments"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ("tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true));
