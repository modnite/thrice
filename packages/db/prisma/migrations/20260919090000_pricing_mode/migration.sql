-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('ELAPSED', 'CALENDAR_DAYS');

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN "pricingMode" "PricingMode" NOT NULL DEFAULT 'ELAPSED';
