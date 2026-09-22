-- Fix stop_list_items unique index column order
-- Prisma one-to-one relation requires @@unique field order to match the relation fields:
-- @relation(fields: [tenantId, menuItemId]) → needs @@unique([tenantId, menuItemId])
-- The existing index has columns in reverse order (menu_item_id, tenant_id).

DROP INDEX "stop_list_items_menu_item_id_tenant_id_key";
CREATE UNIQUE INDEX "stop_list_items_tenant_id_menu_item_id_key"
  ON "stop_list_items"("tenant_id", "menu_item_id");
