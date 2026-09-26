CREATE UNIQUE INDEX "staff_shifts_one_open_per_tenant_key"
  ON "staff_shifts" ("tenant_id")
  WHERE "closed_at" IS NULL;
