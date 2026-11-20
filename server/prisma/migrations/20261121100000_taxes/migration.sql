-- AlterTable
ALTER TABLE "Product" ADD COLUMN "taxable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "taxTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "taxes" JSONB;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "taxTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "taxes" JSONB;

-- CreateTable
CREATE TABLE "Tax" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(7,4) NOT NULL,
    "number" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "Tax_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tax_tenantId_idx" ON "Tax"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Tax_tenantId_name_key" ON "Tax"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "Tax" ADD CONSTRAINT "Tax_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
