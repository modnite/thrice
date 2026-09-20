-- New stores and orders default to neutral values. Existing rows keep whatever they have.
ALTER TABLE "stores" ALTER COLUMN "currency" SET DEFAULT 'USD';
ALTER TABLE "stores" ALTER COLUMN "timezone" SET DEFAULT 'UTC';
ALTER TABLE "orders" ALTER COLUMN "currency" SET DEFAULT 'USD';
