ALTER TABLE "Tenant"
  ADD COLUMN "brandColor" TEXT NOT NULL DEFAULT '#e0533c',
  ADD COLUMN "logoUrl" TEXT;

CREATE TABLE "Table" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "qrToken" TEXT NOT NULL,

  CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Table_qrToken_key" ON "Table"("qrToken");
CREATE INDEX "Table_tenantId_idx" ON "Table"("tenantId");
ALTER TABLE "Table" ADD CONSTRAINT "Table_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
