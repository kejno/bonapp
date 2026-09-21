ALTER TABLE "MenuCategory" RENAME TO "menu_categories";
ALTER TABLE "MenuItem" RENAME TO "menu_items";
ALTER TABLE "ModifierGroup" RENAME TO "modifier_groups";
ALTER TABLE "Modifier" RENAME TO "modifiers";
ALTER TABLE "MenuItemModifierGroup" RENAME TO "menu_item_modifier_groups";
ALTER TABLE "StopListItem" RENAME TO "stop_list_items";

ALTER TABLE "menu_categories" RENAME CONSTRAINT "MenuCategory_pkey" TO "menu_categories_pkey";
ALTER TABLE "menu_item_modifier_groups" RENAME CONSTRAINT "MenuItemModifierGroup_pkey" TO "menu_item_modifier_groups_pkey";
ALTER TABLE "menu_items" RENAME CONSTRAINT "MenuItem_pkey" TO "menu_items_pkey";
ALTER TABLE "modifier_groups" RENAME CONSTRAINT "ModifierGroup_pkey" TO "modifier_groups_pkey";
ALTER TABLE "modifiers" RENAME CONSTRAINT "Modifier_pkey" TO "modifiers_pkey";
ALTER TABLE "stop_list_items" RENAME CONSTRAINT "StopListItem_pkey" TO "stop_list_items_pkey";

ALTER TABLE "menu_categories" RENAME CONSTRAINT "MenuCategory_tenantId_fkey" TO "menu_categories_tenantId_fkey";
ALTER TABLE "menu_item_modifier_groups" RENAME CONSTRAINT "MenuItemModifierGroup_menuItemId_tenantId_fkey" TO "menu_item_modifier_groups_menuItemId_tenantId_fkey";
ALTER TABLE "menu_item_modifier_groups" RENAME CONSTRAINT "MenuItemModifierGroup_modifierGroupId_tenantId_fkey" TO "menu_item_modifier_groups_modifierGroupId_tenantId_fkey";
ALTER TABLE "menu_items" RENAME CONSTRAINT "MenuItem_categoryId_tenantId_fkey" TO "menu_items_categoryId_tenantId_fkey";
ALTER TABLE "menu_items" RENAME CONSTRAINT "MenuItem_tenantId_fkey" TO "menu_items_tenantId_fkey";
ALTER TABLE "modifier_groups" RENAME CONSTRAINT "ModifierGroup_tenantId_fkey" TO "modifier_groups_tenantId_fkey";
ALTER TABLE "modifiers" RENAME CONSTRAINT "Modifier_modifierGroupId_tenantId_fkey" TO "modifiers_modifierGroupId_tenantId_fkey";
ALTER TABLE "modifiers" RENAME CONSTRAINT "Modifier_tenantId_fkey" TO "modifiers_tenantId_fkey";
ALTER TABLE "stop_list_items" RENAME CONSTRAINT "StopListItem_menuItemId_tenantId_fkey" TO "stop_list_items_menuItemId_tenantId_fkey";
ALTER TABLE "stop_list_items" RENAME CONSTRAINT "StopListItem_tenantId_fkey" TO "stop_list_items_tenantId_fkey";

ALTER INDEX "MenuCategory_id_tenantId_key" RENAME TO "menu_categories_id_tenantId_key";
ALTER INDEX "MenuCategory_tenantId_sortOrder_idx" RENAME TO "menu_categories_tenantId_sortOrder_idx";
ALTER INDEX "MenuItemModifierGroup_tenantId_idx" RENAME TO "menu_item_modifier_groups_tenantId_idx";
ALTER INDEX "MenuItem_id_tenantId_key" RENAME TO "menu_items_id_tenantId_key";
ALTER INDEX "MenuItem_tenantId_categoryId_sortOrder_idx" RENAME TO "menu_items_tenantId_categoryId_sortOrder_idx";
ALTER INDEX "ModifierGroup_id_tenantId_key" RENAME TO "modifier_groups_id_tenantId_key";
ALTER INDEX "ModifierGroup_tenantId_sortOrder_idx" RENAME TO "modifier_groups_tenantId_sortOrder_idx";
ALTER INDEX "Modifier_id_tenantId_key" RENAME TO "modifiers_id_tenantId_key";
ALTER INDEX "Modifier_tenantId_modifierGroupId_sortOrder_idx" RENAME TO "modifiers_modifierGroupId_tenantId_idx";
ALTER INDEX "StopListItem_menuItemId_tenantId_key" RENAME TO "stop_list_items_menuItemId_tenantId_key";
ALTER INDEX "StopListItem_tenantId_idx" RENAME TO "stop_list_items_tenantId_idx";
