-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "mode" TEXT NOT NULL DEFAULT 'mock',
    "lastSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SupplierCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "secretLastFour" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" DATETIME,
    CONSTRAINT "SupplierCredential_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierProductMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "imageUrl" TEXT,
    "shopifyVariantId" TEXT,
    "shopifyInventoryItemId" TEXT,
    "shopifyLocationId" TEXT,
    "supplierQuantity" INTEGER NOT NULL DEFAULT 0,
    "shopifyQuantity" INTEGER NOT NULL DEFAULT 0,
    "syncStatus" TEXT NOT NULL DEFAULT 'pending',
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupplierProductMapping_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventorySyncEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "eventTimestamp" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "previousQuantity" INTEGER,
    "newQuantity" INTEGER,
    "errorMessage" TEXT,
    "idempotencyKey" TEXT,
    "rawPayload" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventorySyncEvent_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventorySyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "eventId" TEXT,
    "syncEventId" TEXT,
    "supplierId" TEXT,
    "sku" TEXT,
    "previousQuantity" INTEGER,
    "newQuantity" INTEGER,
    "outcome" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventorySyncLog_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventorySyncLog_syncEventId_fkey" FOREIGN KEY ("syncEventId") REFERENCES "InventorySyncEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MockInventoryLevel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "available" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Supplier_shop_idx" ON "Supplier"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_shop_externalId_key" ON "Supplier"("shop", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCredential_supplierId_key" ON "SupplierCredential"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierProductMapping_shop_sku_idx" ON "SupplierProductMapping"("shop", "sku");

-- CreateIndex
CREATE INDEX "SupplierProductMapping_supplierId_idx" ON "SupplierProductMapping"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProductMapping_shop_supplierId_sku_key" ON "SupplierProductMapping"("shop", "supplierId", "sku");

-- CreateIndex
CREATE INDEX "InventorySyncEvent_shop_status_idx" ON "InventorySyncEvent"("shop", "status");

-- CreateIndex
CREATE INDEX "InventorySyncEvent_supplierId_sku_eventTimestamp_idx" ON "InventorySyncEvent"("supplierId", "sku", "eventTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "InventorySyncEvent_shop_eventId_key" ON "InventorySyncEvent"("shop", "eventId");

-- CreateIndex
CREATE INDEX "InventorySyncLog_shop_createdAt_idx" ON "InventorySyncLog"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "InventorySyncLog_eventId_idx" ON "InventorySyncLog"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "MockInventoryLevel_shop_inventoryItemId_locationId_key" ON "MockInventoryLevel"("shop", "inventoryItemId", "locationId");
