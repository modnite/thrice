-- "Pay in-store" was redundant (card and cash are both taken in store). Orders that used it keep
-- their paid or unpaid status and simply have no method recorded.
UPDATE "orders" SET "paymentMethod" = NULL WHERE "paymentMethod" = 'IN_STORE';
UPDATE "order_deposits" SET "method" = NULL WHERE "method" = 'IN_STORE';

CREATE TYPE "PaymentMethod_new" AS ENUM ('CARD', 'CASH', 'TRANSFER');
ALTER TABLE "orders" ALTER COLUMN "paymentMethod" TYPE "PaymentMethod_new" USING ("paymentMethod"::text::"PaymentMethod_new");
ALTER TABLE "order_deposits" ALTER COLUMN "method" TYPE "PaymentMethod_new" USING ("method"::text::"PaymentMethod_new");
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
DROP TYPE "PaymentMethod_old";

-- Store settings saved before this change may still carry the old entry.
UPDATE "stores" SET "paymentMethodConfig" = "paymentMethodConfig" - 'IN_STORE' WHERE "paymentMethodConfig" IS NOT NULL;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "paymentReference" TEXT;
