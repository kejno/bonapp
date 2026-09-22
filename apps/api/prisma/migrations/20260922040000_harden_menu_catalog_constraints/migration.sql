ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_price_check" CHECK ("price" >= 0);
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_price_check" CHECK ("price" >= 0);

ALTER TABLE "menu_categories" RENAME CONSTRAINT "menu_categories_tenantId_fkey" TO "menu_categories_tenant_id_fkey";
ALTER TABLE "menu_item_modifier_groups" RENAME CONSTRAINT "menu_item_modifier_groups_menuItemId_tenantId_fkey" TO "menu_item_modifier_groups_menu_item_id_tenant_id_fkey";
ALTER TABLE "menu_item_modifier_groups" RENAME CONSTRAINT "menu_item_modifier_groups_modifierGroupId_tenantId_fkey" TO "menu_item_modifier_groups_modifier_group_id_tenant_id_fkey";
ALTER TABLE "menu_items" RENAME CONSTRAINT "menu_items_categoryId_tenantId_fkey" TO "menu_items_category_id_tenant_id_fkey";
ALTER TABLE "menu_items" RENAME CONSTRAINT "menu_items_tenantId_fkey" TO "menu_items_tenant_id_fkey";
ALTER TABLE "modifier_groups" RENAME CONSTRAINT "modifier_groups_tenantId_fkey" TO "modifier_groups_tenant_id_fkey";
ALTER TABLE "modifiers" RENAME CONSTRAINT "modifiers_modifierGroupId_tenantId_fkey" TO "modifiers_modifier_group_id_tenant_id_fkey";
ALTER TABLE "modifiers" RENAME CONSTRAINT "modifiers_tenantId_fkey" TO "modifiers_tenant_id_fkey";
ALTER TABLE "stop_list_items" RENAME CONSTRAINT "stop_list_items_menuItemId_tenantId_fkey" TO "stop_list_items_menu_item_id_tenant_id_fkey";
ALTER TABLE "stop_list_items" RENAME CONSTRAINT "stop_list_items_tenantId_fkey" TO "stop_list_items_tenant_id_fkey";

ALTER INDEX "menu_categories_id_tenantId_key" RENAME TO "menu_categories_id_tenant_id_key";
ALTER INDEX "menu_categories_tenantId_sortOrder_idx" RENAME TO "menu_categories_tenant_id_sort_order_idx";
ALTER INDEX "menu_item_modifier_groups_tenantId_idx" RENAME TO "menu_item_modifier_groups_tenant_id_idx";
ALTER INDEX "menu_items_id_tenantId_key" RENAME TO "menu_items_id_tenant_id_key";
ALTER INDEX "menu_items_tenantId_categoryId_sortOrder_idx" RENAME TO "menu_items_tenant_id_category_id_sort_order_idx";
ALTER INDEX "modifier_groups_id_tenantId_key" RENAME TO "modifier_groups_id_tenant_id_key";
ALTER INDEX "modifier_groups_tenantId_sortOrder_idx" RENAME TO "modifier_groups_tenant_id_sort_order_idx";
ALTER INDEX "modifiers_id_tenantId_key" RENAME TO "modifiers_id_tenant_id_key";
ALTER INDEX "stop_list_items_menuItemId_tenantId_key" RENAME TO "stop_list_items_menu_item_id_tenant_id_key";
ALTER INDEX "stop_list_items_tenantId_idx" RENAME TO "stop_list_items_tenant_id_idx";
