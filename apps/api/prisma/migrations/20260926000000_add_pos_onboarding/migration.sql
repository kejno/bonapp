ALTER TABLE "tenants"
  ADD COLUMN "pos_type" TEXT,
  ADD COLUMN "pos_api_key" TEXT,
  ADD COLUMN "pos_url" TEXT,
  ADD COLUMN "pos_import_state" JSONB;
