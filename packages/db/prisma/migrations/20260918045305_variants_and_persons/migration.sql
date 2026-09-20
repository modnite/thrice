/*
  Warnings:

  - You are about to drop the column `endAt` on the `order_lines` table. All the data in the column will be lost.
  - You are about to drop the column `orderId` on the `order_lines` table. All the data in the column will be lost.
  - You are about to drop the column `priceEach` on the `order_lines` table. All the data in the column will be lost.
  - You are about to drop the column `productId` on the `order_lines` table. All the data in the column will be lost.
  - You are about to drop the column `startAt` on the `order_lines` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `order_lines` table. All the data in the column will be lost.
  - You are about to drop the column `customerId` on the `orders` table. All the data in the column will be lost.
  - Added the required column `bookingId` to the `order_lines` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "order_lines" DROP CONSTRAINT "order_lines_orderId_fkey";

-- DropForeignKey
ALTER TABLE "order_lines" DROP CONSTRAINT "order_lines_productId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_customerId_fkey";

-- DropForeignKey
ALTER TABLE "skus" DROP CONSTRAINT "skus_productId_fkey";

-- DropIndex
DROP INDEX "order_lines_orderId_idx";

-- AlterTable
ALTER TABLE "order_lines" DROP COLUMN "endAt",
DROP COLUMN "orderId",
DROP COLUMN "priceEach",
DROP COLUMN "productId",
DROP COLUMN "startAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "bookingId" TEXT NOT NULL,
ADD COLUMN     "slotId" TEXT;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "customerId";

-- AlterTable
ALTER TABLE "skus" ALTER COLUMN "productId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_resource_slots" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "variant_resource_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_slot_sku_options" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,

    CONSTRAINT "variant_slot_sku_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_persons" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "isLiableCustomer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_bookings" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "personId" TEXT,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "priceEach" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_storeId_productId_name_key" ON "product_variants"("storeId", "productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "variant_resource_slots_variantId_slotIndex_key" ON "variant_resource_slots"("variantId", "slotIndex");

-- CreateIndex
CREATE INDEX "variant_slot_sku_options_skuId_idx" ON "variant_slot_sku_options"("skuId");

-- CreateIndex
CREATE UNIQUE INDEX "variant_slot_sku_options_slotId_skuId_key" ON "variant_slot_sku_options"("slotId", "skuId");

-- CreateIndex
CREATE INDEX "order_persons_orderId_idx" ON "order_persons"("orderId");

-- CreateIndex
CREATE INDEX "order_persons_customerId_idx" ON "order_persons"("customerId");

-- CreateIndex
CREATE INDEX "order_bookings_orderId_idx" ON "order_bookings"("orderId");

-- CreateIndex
CREATE INDEX "order_bookings_variantId_idx" ON "order_bookings"("variantId");

-- CreateIndex
CREATE INDEX "order_lines_bookingId_idx" ON "order_lines"("bookingId");

-- AddForeignKey
ALTER TABLE "skus" ADD CONSTRAINT "skus_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_resource_slots" ADD CONSTRAINT "variant_resource_slots_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_slot_sku_options" ADD CONSTRAINT "variant_slot_sku_options_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "variant_resource_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_slot_sku_options" ADD CONSTRAINT "variant_slot_sku_options_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_persons" ADD CONSTRAINT "order_persons_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_persons" ADD CONSTRAINT "order_persons_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_bookings" ADD CONSTRAINT "order_bookings_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_bookings" ADD CONSTRAINT "order_bookings_personId_fkey" FOREIGN KEY ("personId") REFERENCES "order_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_bookings" ADD CONSTRAINT "order_bookings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_bookings" ADD CONSTRAINT "order_bookings_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "order_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "variant_resource_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
