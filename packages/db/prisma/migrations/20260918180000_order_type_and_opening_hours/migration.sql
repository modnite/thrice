-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('BOOKING', 'SALE', 'SUBSCRIPTION', 'BUYBACK');

-- AlterTable
ALTER TABLE "stores" ADD COLUMN "openingHours" JSONB;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "type" "OrderType" NOT NULL DEFAULT 'BOOKING';
