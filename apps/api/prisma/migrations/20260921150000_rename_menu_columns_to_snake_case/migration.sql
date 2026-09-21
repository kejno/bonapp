ALTER TABLE "menu_categories" RENAME COLUMN "tenantId" TO "tenant_id";
ALTER TABLE "menu_categories" RENAME COLUMN "sortOrder" TO "sort_order";
ALTER TABLE "menu_categories" RENAME COLUMN "isActive" TO "is_active";

ALTER TABLE "menu_items" RENAME COLUMN "tenantId" TO "tenant_id";
ALTER TABLE "menu_items" RENAME COLUMN "categoryId" TO "category_id";
ALTER TABLE "menu_items" RENAME COLUMN "sortOrder" TO "sort_order";
ALTER TABLE "menu_items" RENAME COLUMN "isActive" TO "is_active";

ALTER TABLE "modifier_groups" RENAME COLUMN "tenantId" TO "tenant_id";
ALTER TABLE "modifier_groups" RENAME COLUMN "sortOrder" TO "sort_order";

ALTER TABLE "modifiers" RENAME COLUMN "tenantId" TO "tenant_id";
ALTER TABLE "modifiers" RENAME COLUMN "modifierGroupId" TO "modifier_group_id";
ALTER TABLE "modifiers" RENAME COLUMN "sortOrder" TO "sort_order";

ALTER TABLE "menu_item_modifier_groups" RENAME COLUMN "menuItemId" TO "menu_item_id";
ALTER TABLE "menu_item_modifier_groups" RENAME COLUMN "modifierGroupId" TO "modifier_group_id";
ALTER TABLE "menu_item_modifier_groups" RENAME COLUMN "tenantId" TO "tenant_id";
ALTER TABLE "menu_item_modifier_groups" RENAME COLUMN "sortOrder" TO "sort_order";

ALTER TABLE "stop_list_items" RENAME COLUMN "tenantId" TO "tenant_id";
ALTER TABLE "stop_list_items" RENAME COLUMN "menuItemId" TO "menu_item_id";
ALTER TABLE "stop_list_items" RENAME COLUMN "isStopped" TO "is_stopped";
ALTER TABLE "stop_list_items" RENAME COLUMN "updatedAt" TO "updated_at";
