CREATE TABLE "TenantPaymentSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantPaymentSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantPaymentSetting_tenantId_gateway_key" ON "TenantPaymentSetting"("tenantId", "gateway");
CREATE INDEX "TenantPaymentSetting_tenantId_idx" ON "TenantPaymentSetting"("tenantId");

ALTER TABLE "TenantPaymentSetting" ADD CONSTRAINT "TenantPaymentSetting_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
