-- Menu records are tenant-owned. Modifier options inherit ownership from
-- their modifier group because they do not carry tenant_id directly.

ALTER TABLE "menu_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_categories" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "menu_categories"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ("tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true));

ALTER TABLE "menu_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_items" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "menu_items"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ("tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true));

ALTER TABLE "modifier_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "modifier_groups" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "modifier_groups"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ("tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true));

ALTER TABLE "modifier_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "modifier_options" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "modifier_options"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (
    EXISTS (
      SELECT 1
      FROM "modifier_groups"
      WHERE "modifier_groups"."id" = "modifier_options"."group_id"
        AND "modifier_groups"."tenant_id" = current_setting('app.current_tenant_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "modifier_groups"
      WHERE "modifier_groups"."id" = "modifier_options"."group_id"
        AND "modifier_groups"."tenant_id" = current_setting('app.current_tenant_id', true)
    )
  );
