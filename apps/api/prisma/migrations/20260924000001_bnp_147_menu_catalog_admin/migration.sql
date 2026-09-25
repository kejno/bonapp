-- Add pos_category_id to menu_categories (optional external POS identifier, unique per tenant)
ALTER TABLE "menu_categories" ADD COLUMN "pos_category_id" TEXT;

CREATE UNIQUE INDEX "menu_categories_tenant_id_pos_category_id_key"
  ON "menu_categories"("tenant_id", "pos_category_id");

-- Change FK on menu_items -> menu_categories from RESTRICT to CASCADE
ALTER TABLE "menu_items" DROP CONSTRAINT "menu_items_tenant_id_category_id_fkey";

ALTER TABLE "menu_items"
  ADD CONSTRAINT "menu_items_tenant_id_category_id_fkey"
  FOREIGN KEY ("tenant_id", "category_id")
  REFERENCES "menu_categories"("tenant_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
