-- CreateTable
CREATE TABLE "ProductBarcode" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ProductBarcode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductBarcode_productId_idx" ON "ProductBarcode"("productId");

-- CreateIndex
CREATE INDEX "ProductBarcode_tenantId_idx" ON "ProductBarcode"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductBarcode_tenantId_code_key" ON "ProductBarcode"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "ProductBarcode" ADD CONSTRAINT "ProductBarcode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBarcode" ADD CONSTRAINT "ProductBarcode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
