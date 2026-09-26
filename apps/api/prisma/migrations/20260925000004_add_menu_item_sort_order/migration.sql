ALTER TABLE "menu_items" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "tenant_id", "category_id" ORDER BY "name", "id") - 1 AS position
  FROM "menu_items"
)
UPDATE "menu_items" AS item SET "sort_order" = ranked.position
FROM ranked WHERE item."id" = ranked."id";
