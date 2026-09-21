-- CreateTable
CREATE TABLE "menu_categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_byn" DECIMAL(10,2) NOT NULL,
    "cost_price_byn" DECIMAL(10,2),
    "image_url" TEXT,
    "weight_grams" INTEGER,
    "calories" INTEGER,
    "proteins" DECIMAL(7,2),
    "fats" DECIMAL(7,2),
    "carbs" DECIMAL(7,2),
    "allergens" TEXT[],
    "kitchen_department" TEXT,
    "cooking_time_minutes" INTEGER,
    "is_in_stop_list" BOOLEAN NOT NULL DEFAULT false,
    "pos_item_id" TEXT,
    "is_hit" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "menu_items_price_byn_non_negative_check" CHECK ("price_byn" >= 0 AND "price_byn" <> 'NaN'::numeric),
    CONSTRAINT "menu_items_cost_price_byn_non_negative_check" CHECK ("cost_price_byn" >= 0 AND "cost_price_byn" <> 'NaN'::numeric)
);

-- CreateTable
CREATE TABLE "modifier_groups" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "min_selection" INTEGER NOT NULL DEFAULT 0,
    "max_selection" INTEGER,

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "modifier_groups_min_selection_non_negative_check" CHECK ("min_selection" >= 0),
    CONSTRAINT "modifier_groups_selection_range_check" CHECK ("max_selection" IS NULL OR "max_selection" >= "min_selection")
);

-- CreateTable
CREATE TABLE "modifier_options" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "extra_price_byn" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "modifier_options_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "modifier_options_extra_price_byn_non_negative_check" CHECK ("extra_price_byn" >= 0 AND "extra_price_byn" <> 'NaN'::numeric)
);

-- CreateIndex
CREATE INDEX "menu_categories_tenant_id_idx" ON "menu_categories"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_categories_tenant_id_id_key" ON "menu_categories"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "idx_menu_items_tenant_cat" ON "menu_items"("tenant_id", "category_id") WHERE "is_active" = TRUE;

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_tenant_id_id_key" ON "menu_items"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "modifier_groups_tenant_id_idx" ON "modifier_groups"("tenant_id");

-- CreateIndex
CREATE INDEX "modifier_groups_item_id_idx" ON "modifier_groups"("item_id");

-- CreateIndex
CREATE INDEX "modifier_options_group_id_idx" ON "modifier_options"("group_id");

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "menu_categories"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_tenant_id_item_id_fkey" FOREIGN KEY ("tenant_id", "item_id") REFERENCES "menu_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "modifier_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
