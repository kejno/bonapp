-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModifierGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ModifierGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Modifier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "modifierGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Modifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemModifierGroup" (
    "menuItemId" TEXT NOT NULL,
    "modifierGroupId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MenuItemModifierGroup_pkey" PRIMARY KEY ("menuItemId", "modifierGroupId")
);

-- CreateTable
CREATE TABLE "StopListItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "isStopped" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StopListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_id_tenantId_key" ON "MenuCategory"("id", "tenantId");
CREATE INDEX "MenuCategory_tenantId_sortOrder_idx" ON "MenuCategory"("tenantId", "sortOrder");
CREATE UNIQUE INDEX "MenuItem_id_tenantId_key" ON "MenuItem"("id", "tenantId");
CREATE INDEX "MenuItem_tenantId_categoryId_sortOrder_idx" ON "MenuItem"("tenantId", "categoryId", "sortOrder");
CREATE UNIQUE INDEX "ModifierGroup_id_tenantId_key" ON "ModifierGroup"("id", "tenantId");
CREATE INDEX "ModifierGroup_tenantId_sortOrder_idx" ON "ModifierGroup"("tenantId", "sortOrder");
CREATE UNIQUE INDEX "Modifier_id_tenantId_key" ON "Modifier"("id", "tenantId");
CREATE INDEX "Modifier_tenantId_modifierGroupId_sortOrder_idx" ON "Modifier"("tenantId", "modifierGroupId", "sortOrder");
CREATE INDEX "MenuItemModifierGroup_tenantId_idx" ON "MenuItemModifierGroup"("tenantId");
CREATE UNIQUE INDEX "StopListItem_menuItemId_tenantId_key" ON "StopListItem"("menuItemId", "tenantId");
CREATE INDEX "StopListItem_tenantId_idx" ON "StopListItem"("tenantId");

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_tenantId_fkey" FOREIGN KEY ("categoryId", "tenantId") REFERENCES "MenuCategory"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModifierGroup" ADD CONSTRAINT "ModifierGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Modifier" ADD CONSTRAINT "Modifier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Modifier" ADD CONSTRAINT "Modifier_modifierGroupId_tenantId_fkey" FOREIGN KEY ("modifierGroupId", "tenantId") REFERENCES "ModifierGroup"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MenuItemModifierGroup" ADD CONSTRAINT "MenuItemModifierGroup_menuItemId_tenantId_fkey" FOREIGN KEY ("menuItemId", "tenantId") REFERENCES "MenuItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MenuItemModifierGroup" ADD CONSTRAINT "MenuItemModifierGroup_modifierGroupId_tenantId_fkey" FOREIGN KEY ("modifierGroupId", "tenantId") REFERENCES "ModifierGroup"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StopListItem" ADD CONSTRAINT "StopListItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StopListItem" ADD CONSTRAINT "StopListItem_menuItemId_tenantId_fkey" FOREIGN KEY ("menuItemId", "tenantId") REFERENCES "MenuItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
