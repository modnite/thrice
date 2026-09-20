-- Items belong to a person. Older orders left the owner empty (implicitly the liable customer);
-- make that explicit so changing the liable customer never moves items around.
UPDATE "order_bookings" ob
SET "personId" = (
  SELECT op."id" FROM "order_persons" op
  WHERE op."orderId" = ob."orderId"
  ORDER BY op."isLiableCustomer" DESC, op."createdAt" ASC
  LIMIT 1
)
WHERE ob."personId" IS NULL;
