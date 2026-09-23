/*
  Warnings:

  - You are about to drop the column `sort_order` on the `menu_items` table. All the data in the column will be lost.
  - You are about to drop the column `sort_order` on the `modifier_groups` table. All the data in the column will be lost.

*/
-- Drop FK that depends on the old (id, tenant_id) unique index on menu_categories
ALTER TABLE "menu_items" DROP CONSTRAINT "menu_items_tenant_id_category_id_fkey";

-- DropIndex
DROP INDEX "menu_categories_id_tenant_id_key";

-- DropIndex
DROP INDEX "menu_categories_tenant_id_sort_order_idx";

-- DropIndex
DROP INDEX "modifier_groups_tenant_id_sort_order_idx";

-- AlterTable
ALTER TABLE "menu_categories" ALTER COLUMN "sort_order" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "menu_items" DROP COLUMN "sort_order",
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "modifier_groups" DROP COLUMN "sort_order";

-- Recreate FK referencing the current (tenant_id, id) unique index on menu_categories
ALTER TABLE "menu_items"
  ADD CONSTRAINT "menu_items_tenant_id_category_id_fkey"
  FOREIGN KEY ("tenant_id", "category_id")
  REFERENCES "menu_categories"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
