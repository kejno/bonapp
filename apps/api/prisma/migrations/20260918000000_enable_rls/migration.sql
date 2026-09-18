-- Enable Row Level Security on tenant-scoped tables.
--
-- Prerequisites:
--   The application database role must NOT have BYPASSRLS or be a superuser.
--   Before executing tenant-scoped queries, set the session variable:
--     SELECT set_config('app.current_tenant_id', '<tenantId>', true);
--   (the third argument `true` makes it transaction-local via SET LOCAL semantics)
--
-- Registry — first-release tenant-scoped tables:
--   User   — every row belongs to one tenant (filtered by "tenantId")
--   Tenant — system directory; each tenant may only see its own record (filtered by "id")
--
-- Global tables in this release: none.

-- User: row is accessible only to the tenant that owns it
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "User"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- Tenant: each tenant may only see and modify its own record
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Tenant"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ("id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("id" = current_setting('app.current_tenant_id', true));
