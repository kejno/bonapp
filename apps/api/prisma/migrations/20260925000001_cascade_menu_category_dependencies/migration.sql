-- Allow an administrator to delete a category together with its complete menu graph.
-- The old RESTRICT constraints leave orphan-prevention work to the caller and block
-- the category CRUD endpoint whenever an item has stop-list or modifier records.

ALTER TABLE "stop_list_items"
  DROP CONSTRAINT "stop_list_items_tenant_id_menu_item_id_fkey",
  ADD CONSTRAINT "stop_list_items_tenant_id_menu_item_id_fkey"
    FOREIGN KEY ("tenant_id", "menu_item_id") REFERENCES "menu_items"("tenant_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_item_modifier_groups"
  DROP CONSTRAINT "menu_item_modifier_groups_tenant_id_menu_item_id_fkey",
  ADD CONSTRAINT "menu_item_modifier_groups_tenant_id_menu_item_id_fkey"
    FOREIGN KEY ("tenant_id", "menu_item_id") REFERENCES "menu_items"("tenant_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  DROP CONSTRAINT "menu_item_modifier_groups_modifier_group_id_tenant_id_fkey",
  ADD CONSTRAINT "menu_item_modifier_groups_modifier_group_id_tenant_id_fkey"
    FOREIGN KEY ("modifier_group_id", "tenant_id") REFERENCES "modifier_groups"("id", "tenant_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "modifier_groups"
  DROP CONSTRAINT "modifier_groups_tenant_id_item_id_fkey",
  ADD CONSTRAINT "modifier_groups_tenant_id_item_id_fkey"
    FOREIGN KEY ("tenant_id", "item_id") REFERENCES "menu_items"("tenant_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "modifiers"
  DROP CONSTRAINT "modifiers_modifier_group_id_tenant_id_fkey",
  ADD CONSTRAINT "modifiers_modifier_group_id_tenant_id_fkey"
    FOREIGN KEY ("modifier_group_id", "tenant_id") REFERENCES "modifier_groups"("id", "tenant_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "modifier_options"
  DROP CONSTRAINT "modifier_options_group_id_fkey",
  ADD CONSTRAINT "modifier_options_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "modifier_groups"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
