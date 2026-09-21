-- Keep the RLS registry aligned with every tenant-dependent model in schema.prisma.
-- The current tenant is set transaction-locally by PrismaService.forTenant().

ALTER TABLE "dining_areas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dining_areas" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "dining_areas"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ("tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true));

ALTER TABLE "tables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tables" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "tables"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ("tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true));
