-- AlterTable
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- Existing accounts keep their current access; new staff accounts require an initial password change.
ALTER TABLE "users" ALTER COLUMN "must_change_password" SET DEFAULT true;
