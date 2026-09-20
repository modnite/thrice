import type { Prisma } from "@thrice/db";

type Tx = Prisma.TransactionClient;

/**
 * Keeps an order's security deposit in step with what it contains: the sum of each
 * product's per-unit deposit times its quantity. Only a deposit that is still Pending
 * follows the order; once staff have marked it held (or resolved it) the amount is
 * fixed, because real money has been reserved against it.
 */
export async function syncDeposit(tx: Tx, orderId: string): Promise<void> {
  const bookings = await tx.orderBooking.findMany({
    where: { orderId },
    select: { quantity: true, product: { select: { deposit: true } } },
  });
  const amount = bookings.reduce((sum, b) => sum + b.quantity * Number(b.product.deposit), 0);
  const existing = await tx.orderDeposit.findUnique({ where: { orderId } });

  if (!existing) {
    if (amount > 0) await tx.orderDeposit.create({ data: { orderId, amount } });
    return;
  }
  if (existing.status !== "PENDING") return;
  if (amount > 0) await tx.orderDeposit.update({ where: { orderId }, data: { amount } });
  else await tx.orderDeposit.delete({ where: { orderId } });
}
