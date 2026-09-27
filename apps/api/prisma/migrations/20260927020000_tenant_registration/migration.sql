CREATE TYPE "TenantStatus" AS ENUM ('TRIAL');
CREATE TYPE "VenueType" AS ENUM ('RESTAURANT', 'CAFE', 'BAR');

ALTER TABLE "tenants"
  ADD COLUMN "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN "venue_type" "VenueType" NOT NULL DEFAULT 'RESTAURANT';

CREATE TABLE "tenant_registrations" (
  "email" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  CONSTRAINT "tenant_registrations_pkey" PRIMARY KEY ("email"),
  CONSTRAINT "tenant_registrations_tenant_id_key" UNIQUE ("tenant_id"),
  CONSTRAINT "tenant_registrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
