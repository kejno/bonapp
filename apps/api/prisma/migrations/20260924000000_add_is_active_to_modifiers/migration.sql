-- Migration: add is_active column for soft-delete on modifier_groups and modifier_options
-- Required by BNP-148: DELETE modifier-groups/:id and DELETE modifier-options/:id deactivate
-- rather than hard-delete to preserve order history integrity.

ALTER TABLE "modifier_groups"
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "modifier_options"
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
