-- Rename pin_code to pin_hash (now stores bcrypt hash, not plaintext)
ALTER TABLE "users" RENAME COLUMN "pin_code" TO "pin_hash";

-- Add TOTP fields for OWNER/MANAGER two-factor authentication
ALTER TABLE "users"
  ADD COLUMN "totp_secret" TEXT,
  ADD COLUMN "totp_enabled" BOOLEAN NOT NULL DEFAULT false;
