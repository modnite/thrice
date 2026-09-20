-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'HELD', 'CAPTURED', 'RELEASED');

-- CreateTable
CREATE TABLE "order_deposits" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "method" "PaymentMethod",
    "capturedAmount" DECIMAL(12,2),
    "note" TEXT,
    "heldAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_deposits_orderId_key" ON "order_deposits"("orderId");

-- AddForeignKey
ALTER TABLE "order_deposits" ADD CONSTRAINT "order_deposits_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "stores" ADD COLUMN "emailSubject" TEXT,
ADD COLUMN "emailIntro" TEXT,
ADD COLUMN "emailFooter" TEXT,
ADD COLUMN "sendConfirmationOnCreate" BOOLEAN NOT NULL DEFAULT false;
