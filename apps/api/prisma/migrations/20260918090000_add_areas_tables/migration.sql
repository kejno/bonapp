CREATE TYPE "TableStatus" AS ENUM ('FREE', 'OCCUPIED', 'BILL_REQUESTED');

CREATE TABLE "areas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tables" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "label" TEXT,
    "seatsCount" INTEGER NOT NULL,
    "qrToken" TEXT NOT NULL,
    "status" "TableStatus" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tableId" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tables_qrToken_key" ON "tables"("qrToken");
CREATE UNIQUE INDEX "tables_areaId_tableNumber_key" ON "tables"("areaId", "tableNumber");
CREATE INDEX "areas_tenantId_idx" ON "areas"("tenantId");
CREATE INDEX "tables_tenantId_idx" ON "tables"("tenantId");
CREATE INDEX "orders_tenantId_tableId_status_idx" ON "orders"("tenantId", "tableId", "status");

ALTER TABLE "areas" ADD CONSTRAINT "areas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tables" ADD CONSTRAINT "tables_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tables" ADD CONSTRAINT "tables_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
