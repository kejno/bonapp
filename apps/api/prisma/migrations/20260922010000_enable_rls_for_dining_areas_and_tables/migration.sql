-- Dining areas and tables are tenant-owned.

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
  WITH CHECK (
    "tenant_id" = current_setting('app.current_tenant_id', true)
    AND EXISTS (
      SELECT 1
      FROM "dining_areas"
      WHERE "dining_areas"."id" = "tables"."area_id"
        AND "dining_areas"."tenant_id" = current_setting('app.current_tenant_id', true)
    )
  );
