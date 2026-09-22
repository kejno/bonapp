-- Differential migration: extend menu schema
-- Applies on top of: 20260922040000_harden_menu_catalog_constraints
-- Alters existing menu catalog tables; creates modifier_options.

-- ============================================================
-- menu_categories: add timestamps; add new composite unique key
-- ============================================================

ALTER TABLE "menu_categories"
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- New composite unique key (tenant_id, id) required by MenuItem FK
CREATE UNIQUE INDEX "menu_categories_tenant_id_id_key"
  ON "menu_categories"("tenant_id", "id");

CREATE INDEX "menu_categories_tenant_id_idx"
  ON "menu_categories"("tenant_id");

-- ============================================================
-- menu_items: rename price -> price_byn; extend with new columns
-- ============================================================

-- Drop constraint that references the old column name
ALTER TABLE "menu_items" DROP CONSTRAINT "menu_items_price_check";

-- Drop FK that references the old (id, tenant_id) unique key on menu_categories
ALTER TABLE "menu_items" DROP CONSTRAINT "menu_items_category_id_tenant_id_fkey";

-- Drop sort-order-based index; replaced by the partial index below
DROP INDEX "menu_items_tenant_id_category_id_sort_order_idx";

ALTER TABLE "menu_items" RENAME COLUMN "price" TO "price_byn";

ALTER TABLE "menu_items"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "cost_price_byn" DECIMAL(10,2),
  ADD COLUMN "image_url" TEXT,
  ADD COLUMN "weight_grams" INTEGER,
  ADD COLUMN "calories" INTEGER,
  ADD COLUMN "proteins" DECIMAL(7,2),
  ADD COLUMN "fats" DECIMAL(7,2),
  ADD COLUMN "carbs" DECIMAL(7,2),
  ADD COLUMN "allergens" TEXT[],
  ADD COLUMN "kitchen_department" TEXT,
  ADD COLUMN "cooking_time_minutes" INTEGER,
  ADD COLUMN "is_in_stop_list" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pos_item_id" TEXT,
  ADD COLUMN "is_hit" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "menu_items"
  ADD CONSTRAINT "menu_items_price_byn_non_negative_check"
    CHECK ("price_byn" >= 0 AND "price_byn" <> 'NaN'::numeric),
  ADD CONSTRAINT "menu_items_cost_price_byn_non_negative_check"
    CHECK ("cost_price_byn" >= 0 AND "cost_price_byn" <> 'NaN'::numeric);

-- New composite unique key (tenant_id, id) required by ModifierGroup FK
CREATE UNIQUE INDEX "menu_items_tenant_id_id_key"
  ON "menu_items"("tenant_id", "id");

-- Partial index managed manually: Prisma does not support partial indexes
CREATE INDEX "idx_menu_items_tenant_cat"
  ON "menu_items"("tenant_id", "category_id")
  WHERE "is_active" = TRUE;

-- FK to menu_categories via new composite unique key (tenant_id, id)
ALTER TABLE "menu_items"
  ADD CONSTRAINT "menu_items_tenant_id_category_id_fkey"
    FOREIGN KEY ("tenant_id", "category_id") REFERENCES "menu_categories"("tenant_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- modifier_groups: add item_id and selection-range constraints
-- ============================================================

-- Two-step NOT NULL add so the constraint is safe on any existing rows
ALTER TABLE "modifier_groups" ADD COLUMN "item_id" TEXT;
ALTER TABLE "modifier_groups" ALTER COLUMN "item_id" SET NOT NULL;

ALTER TABLE "modifier_groups"
  ADD COLUMN "is_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "min_selection" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "max_selection" INTEGER;

ALTER TABLE "modifier_groups"
  ADD CONSTRAINT "modifier_groups_min_selection_non_negative_check"
    CHECK ("min_selection" >= 0),
  ADD CONSTRAINT "modifier_groups_selection_range_check"
    CHECK ("max_selection" IS NULL OR "max_selection" >= "min_selection");

CREATE INDEX "modifier_groups_tenant_id_idx"
  ON "modifier_groups"("tenant_id");

CREATE INDEX "modifier_groups_item_id_idx"
  ON "modifier_groups"("item_id");

-- FK to menu_items via new composite unique key (tenant_id, id)
ALTER TABLE "modifier_groups"
  ADD CONSTRAINT "modifier_groups_tenant_id_item_id_fkey"
    FOREIGN KEY ("tenant_id", "item_id") REFERENCES "menu_items"("tenant_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- modifier_options: new table
-- ============================================================

CREATE TABLE "modifier_options" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "extra_price_byn" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "modifier_options_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "modifier_options_extra_price_byn_non_negative_check"
      CHECK ("extra_price_byn" >= 0 AND "extra_price_byn" <> 'NaN'::numeric)
);

CREATE INDEX "modifier_options_group_id_idx"
  ON "modifier_options"("group_id");

ALTER TABLE "modifier_options"
  ADD CONSTRAINT "modifier_options_group_id_fkey"
    FOREIGN KEY ("group_id")
    REFERENCES "modifier_groups"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
