-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('IN_STORE', 'CARD', 'CASH', 'TRANSFER');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "paymentMethod" "PaymentMethod";
