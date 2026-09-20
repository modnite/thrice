import { prisma, type Prisma } from "@thrice/db";
import type { ImportOrder } from "@thrice/shared";
import {
  applyDiscount,
  createBookingLine,
  InsufficientAvailabilityError,
  NoPriceTierError,
  SerialUnavailableError,
} from "./orders";

export type OrderImportResult = { orderNumber: number; outcome: "imported" | "would-import" | "skipped" | "error"; message: string };

class Skip extends Error {}
class Problem extends Error {}
class DryRunRollback extends Error {}

type Tx = Prisma.TransactionClient;

async function findVariant(tx: Tx, storeId: string, productName: string, variantName: string) {
  const products = await tx.product.findMany({
    where: { storeId, name: { equals: productName.trim(), mode: "insensitive" } },
    include: { variants: true },
  });
  if (products.length === 0) throw new Problem(`No product called "${productName}".`);
  const product = products[0];
  const named = product.variants.find((v) => v.name.toLowerCase() === variantName.toLowerCase());
  const variant = named ?? (variantName === "Default" && product.variants.length === 1 ? product.variants[0] : undefined);
  if (!variant) throw new Problem(`"${product.name}" has no variant called "${variantName}".`);
  return variant;
}

async function importOne(tx: Tx, storeId: string, userId: string, o: ImportOrder): Promise<string> {
  const clash = await tx.order.findFirst({ where: { storeId, orderNumber: o.orderNumber }, select: { id: true } });
  if (clash) throw new Skip("An order with this number already exists.");

  // Reuse the customer if we already know them (by email, else by exact name), otherwise create one.
  let customer =
    (o.email ? await tx.customer.findFirst({ where: { storeId, email: { equals: o.email, mode: "insensitive" } } }) : null) ??
    (await tx.customer.findFirst({ where: { storeId, name: { equals: o.customer, mode: "insensitive" } } }));
  if (!customer) customer = await tx.customer.create({ data: { storeId, name: o.customer, email: o.email, phone: o.phone } });

  // Cancelled orders hold no stock, so their items are added while the order is still open.
  const settled = o.status === "CANCELLED" ? "UPCOMING" : o.status;
  const endedAt = o.status === "COMPLETED" ? (o.endedAt ?? o.endAt) : null;

  const order = await tx.order.create({
    data: {
      storeId,
      orderNumber: o.orderNumber,
      status: settled,
      startAt: o.startAt,
      endAt: o.endAt,
      startedAt: o.status === "ACTIVE" || o.status === "COMPLETED" ? o.startAt : null,
      endedAt,
      paymentStatus: o.paid ? "PAID" : "UNPAID",
      paymentMethod: o.paymentMethod,
      paymentReference: o.paymentReference,
      discountPercent: o.discountPercent,
      prepared: o.prepared,
      channel: o.channel,
      notes: o.notes,
      totalPrice: 0,
      ...(o.createdAt ? { createdAt: o.createdAt } : {}),
    },
  });
  const person = await tx.orderPerson.create({
    data: {
      orderId: order.id,
      customerId: customer.id,
      name: customer.name,
      email: o.email ?? customer.email,
      phone: o.phone ?? customer.phone,
      isLiableCustomer: true,
      endedAt,
    },
  });

  let base = 0;
  for (const item of o.items) {
    const variant = await findVariant(tx, storeId, item.product, item.variant);
    let articleIds: string[] | undefined;
    if (item.serials.length > 0) {
      const articles = await tx.article.findMany({
        where: { storeId, articleCode: { in: item.serials } },
        select: { id: true, articleCode: true },
      });
      const byCode = new Map(articles.map((a) => [a.articleCode, a.id]));
      const missing = item.serials.filter((code) => !byCode.has(code));
      if (missing.length > 0) throw new Problem(`Unknown serial number(s): ${missing.join(", ")}.`);
      articleIds = item.serials.map((code) => byCode.get(code) as string);
    }
    const { priceEach } = await createBookingLine(tx, storeId, order.id, {
      variantId: variant.id,
      quantity: item.quantity,
      from: o.startAt,
      to: o.endAt,
      personId: person.id,
      priceOverride: item.priceEach ?? undefined,
      articleIds,
    });
    base += item.quantity * priceEach;
  }

  await tx.order.update({
    where: { id: order.id },
    data: {
      totalPrice: applyDiscount(base, o.discountPercent),
      ...(o.status === "CANCELLED" ? { status: "CANCELLED", cancelledAt: new Date() } : {}),
    },
  });
  await tx.auditLog.create({
    data: { storeId, userId, action: "ORDER_IMPORTED", entityType: "Order", entityId: order.id, diff: { orderNumber: o.orderNumber } },
  });
  return `${o.items.reduce((n, i) => n + i.quantity, 0)} item(s) for ${customer.name}.`;
}

function failure(err: unknown, orderNumber: number): OrderImportResult {
  if (err instanceof Skip) return { orderNumber, outcome: "skipped", message: err.message };
  if (
    err instanceof Problem ||
    err instanceof InsufficientAvailabilityError ||
    err instanceof NoPriceTierError ||
    err instanceof SerialUnavailableError
  ) {
    return { orderNumber, outcome: "error", message: err.message };
  }
  return { orderNumber, outcome: "error", message: "Unexpected error while importing this order." };
}

/**
 * Creates the given orders exactly as written (numbers, status, times, serials, payment), in file order.
 *
 * A real import gives every order its own transaction, so one bad order never blocks the rest. A check
 * (`dryRun`) runs the same code for the whole file inside ONE transaction, with a savepoint per order,
 * and rolls everything back at the end. Orders therefore see each other exactly as they will in a real
 * import (for example two orders pinning the same serial for the same dates), and nothing is saved.
 */
export async function importOrders(storeId: string, userId: string, orders: ImportOrder[], dryRun: boolean): Promise<OrderImportResult[]> {
  const results: OrderImportResult[] = [];

  if (dryRun) {
    try {
      await prisma.$transaction(
        async (tx) => {
          for (const o of orders) {
            await tx.$executeRawUnsafe("SAVEPOINT import_order");
            try {
              const message = await importOne(tx, storeId, userId, o);
              await tx.$executeRawUnsafe("RELEASE SAVEPOINT import_order");
              results.push({ orderNumber: o.orderNumber, outcome: "would-import", message });
            } catch (err) {
              await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT import_order");
              results.push(failure(err, o.orderNumber));
            }
          }
          throw new DryRunRollback("check finished");
        },
        { timeout: 60_000 + orders.length * 2_000, maxWait: 10_000 }
      );
    } catch (err) {
      if (!(err instanceof DryRunRollback)) throw err;
    }
    return results;
  }

  for (const o of orders) {
    try {
      const message = await prisma.$transaction((tx) => importOne(tx, storeId, userId, o), { timeout: 30_000 });
      results.push({ orderNumber: o.orderNumber, outcome: "imported", message });
    } catch (err) {
      results.push(failure(err, o.orderNumber));
    }
  }
  return results;
}
