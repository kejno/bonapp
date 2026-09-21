-- Enable Row Level Security for the original tenant-scoped tables.
-- The application role must not be a superuser or have BYPASSRLS.

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "users"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ("tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true));

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "tenants"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ("id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("id" = current_setting('app.current_tenant_id', true));
