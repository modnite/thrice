-- CreateEnum
CREATE TYPE "ReturnMethod" AS ENUM ('STORE', 'PICKUP');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "returnMethod" "ReturnMethod" NOT NULL DEFAULT 'STORE',
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "endedAt" TIMESTAMP(3);

-- Orders that were already Active/Completed under the old time-driven model.
UPDATE "orders" SET "startedAt" = "startAt" WHERE "status" IN ('ACTIVE', 'COMPLETED');
UPDATE "orders" SET "endedAt" = "endAt" WHERE "status" = 'COMPLETED';

-- AlterTable
ALTER TABLE "order_persons" ADD COLUMN "endedAt" TIMESTAMP(3);
UPDATE "order_persons" SET "endedAt" = o."endAt" FROM "orders" o WHERE "order_persons"."orderId" = o."id" AND o."status" = 'COMPLETED';

-- AlterTable
ALTER TABLE "stores" ADD COLUMN "paymentMethodConfig" JSONB;
