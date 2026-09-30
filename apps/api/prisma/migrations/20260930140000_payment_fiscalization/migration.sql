CREATE TYPE "FiscalizationStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'FISCALIZED', 'FISCAL_FAILED');

ALTER TABLE "payments"
ADD COLUMN "fiscalization_status" "FiscalizationStatus" NOT NULL DEFAULT 'NOT_REQUIRED';
