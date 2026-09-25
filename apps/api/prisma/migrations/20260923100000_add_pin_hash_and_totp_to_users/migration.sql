-- Rename pin_code to pin_hash (now stores bcrypt hash, not plaintext)
ALTER TABLE "users" RENAME COLUMN "pin_code" TO "pin_hash";
