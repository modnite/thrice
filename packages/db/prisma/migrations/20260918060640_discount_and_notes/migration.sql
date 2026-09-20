-- AlterTable
ALTER TABLE "order_bookings" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "discountPercent" DECIMAL(5,2);
