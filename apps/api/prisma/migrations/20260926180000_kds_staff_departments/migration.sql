ALTER TABLE "users" ADD COLUMN "kitchen_departments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
