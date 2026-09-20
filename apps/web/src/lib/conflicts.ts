import { prisma, Prisma } from "@thrice/db";

export type Conflict = {
  orderId: string;
  orderNumber: number;
  kind: "DOUBLE_BOOKED" | "UNAVAILABLE_ITEM" | "OVERBOOKED";
  message: string;
};

// The effective end of an order's window for a line: Active orders hold their stock until
// they're ended, so an overdue one runs to "now"; a completed one stops at its actual end.
const endOf = (o: string, ob: string) =>
  Prisma.raw(`CASE
    WHEN ${o}.status = 'ACTIVE' THEN GREATEST(COALESCE(${ob}."endAt", ${o}."endAt"), now() AT TIME ZONE 'UTC')
    ELSE COALESCE(${ob}."endAt", ${o}."endAt")
  END`);
const startOf = (o: string, ob: string) => Prisma.raw(`COALESCE(${ob}."startAt", ${o}."startAt")`);

/**
 * Finds stock conflicts on the store's open (Upcoming or Active) orders. Booking itself can't
 * overbook, but data changes afterwards can: an item marked lost, a serial swapped onto an
 * order that already had it, stock removed. This is TWICE's "stock item conflict" warning.
 */
export async function getOpenOrderConflicts(storeId: string): Promise<Map<string, Conflict[]>> {
  const out = new Map<string, Conflict[]>();
  const add = (c: Conflict) => {
    const list = out.get(c.orderId) ?? [];
    if (!list.some((x) => x.message === c.message)) list.push(c);
    out.set(c.orderId, list);
  };

  // 1. The same physical item on two open orders with overlapping windows.
  const doubles = await prisma.$queryRaw<{ orderId: string; orderNumber: number; otherNumber: number; articleCode: string }[]>`
    SELECT o1.id AS "orderId", o1."orderNumber" AS "orderNumber", o2."orderNumber" AS "otherNumber", a."articleCode" AS "articleCode"
    FROM order_lines l1
    JOIN order_bookings ob1 ON ob1.id = l1."bookingId"
    JOIN orders o1 ON o1.id = ob1."orderId"
    JOIN order_lines l2 ON l2."articleId" = l1."articleId" AND l2.id <> l1.id
    JOIN order_bookings ob2 ON ob2.id = l2."bookingId"
    JOIN orders o2 ON o2.id = ob2."orderId" AND o2.id <> o1.id
    JOIN articles a ON a.id = l1."articleId"
    WHERE o1."storeId" = ${storeId}
      AND o1.status IN ('UPCOMING', 'ACTIVE') AND o2.status IN ('UPCOMING', 'ACTIVE')
      AND (${startOf("o1", "ob1")}, ${endOf("o1", "ob1")}) OVERLAPS (${startOf("o2", "ob2")}, ${endOf("o2", "ob2")})
  `;
  for (const d of doubles) {
    add({
      orderId: d.orderId,
      orderNumber: d.orderNumber,
      kind: "DOUBLE_BOOKED",
      message: `${d.articleCode} is also booked on order #${d.otherNumber} at the same time.`,
    });
  }

  // 2. An assigned item that is no longer in use (lost, out of use).
  const unavailable = await prisma.orderLine.findMany({
    where: {
      article: { status: { not: "IN_USE" } },
      booking: { order: { storeId, status: { in: ["UPCOMING", "ACTIVE"] } } },
    },
    select: { article: { select: { articleCode: true, status: true } }, booking: { select: { order: { select: { id: true, orderNumber: true } } } } },
  });
  for (const l of unavailable) {
    const o = l.booking.order;
    add({
      orderId: o.id,
      orderNumber: o.orderNumber,
      kind: "UNAVAILABLE_ITEM",
      message: `${l.article!.articleCode} is ${l.article!.status === "LOST" ? "marked lost" : "out of use"}.`,
    });
  }

  // 3. Bulk stock: more units booked at once than the store has in use.
  const bulkLines = await prisma.orderLine.findMany({
    where: { sku: { trackedIndividually: false }, booking: { order: { storeId, status: { in: ["UPCOMING", "ACTIVE"] } } } },
    select: {
      quantity: true,
      skuId: true,
      sku: { select: { name: true } },
      booking: { select: { startAt: true, endAt: true, order: { select: { id: true, orderNumber: true, startAt: true, endAt: true, status: true } } } },
    },
  });
  if (bulkLines.length > 0) {
    const skuIds = [...new Set(bulkLines.map((l) => l.skuId))];
    const stockRows = await prisma.article.groupBy({
      by: ["skuId"],
      where: { storeId, skuId: { in: skuIds }, status: "IN_USE" },
      _sum: { quantity: true },
    });
    const stock = new Map(stockRows.map((r) => [r.skuId, r._sum.quantity ?? 0]));
    const now = Date.now();
    const windows = bulkLines.map((l) => {
      const o = l.booking.order;
      const start = (l.booking.startAt ?? o.startAt).getTime();
      let end = (l.booking.endAt ?? o.endAt).getTime();
      if (o.status === "ACTIVE") end = Math.max(end, now);
      return { line: l, start, end };
    });
    for (const w of windows) {
      const overlapping = windows.filter((x) => x.line.skuId === w.line.skuId && x.start < w.end && w.start < x.end);
      const booked = overlapping.reduce((n, x) => n + x.line.quantity, 0);
      const have = stock.get(w.line.skuId) ?? 0;
      if (booked > have) {
        const o = w.line.booking.order;
        add({
          orderId: o.id,
          orderNumber: o.orderNumber,
          kind: "OVERBOOKED",
          message: `${w.line.sku.name}: ${booked} booked at once but only ${have} in stock.`,
        });
      }
    }
  }

  return out;
}
