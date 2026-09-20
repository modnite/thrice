-- Payment options are now managed per store, so an order records the option's name as text.
ALTER TABLE "orders" ALTER COLUMN "paymentMethod" TYPE TEXT USING (
  CASE "paymentMethod"::text WHEN 'CARD' THEN 'Debit/Credit Card' WHEN 'CASH' THEN 'Cash' WHEN 'TRANSFER' THEN 'Online Transfer' END
);
ALTER TABLE "order_deposits" ALTER COLUMN "method" TYPE TEXT USING (
  CASE "method"::text WHEN 'CARD' THEN 'Debit/Credit Card' WHEN 'CASH' THEN 'Cash' WHEN 'TRANSFER' THEN 'Online Transfer' END
);
DROP TYPE "PaymentMethod";
