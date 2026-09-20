-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "prepared" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "price_tiers" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "price" DECIMAL(12,2) NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_tiers_variantId_idx" ON "price_tiers"("variantId");

-- AddForeignKey
ALTER TABLE "price_tiers" ADD CONSTRAINT "price_tiers_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
