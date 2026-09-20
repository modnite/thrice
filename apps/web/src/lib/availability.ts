import { prisma, type Prisma } from "@thrice/db";

export type SkuAvailability = {
  skuId: string;
  trackedIndividually: boolean;
  total: number;
  reserved: number;
  available: number;
};

type Tx = Prisma.TransactionClient;

/**
 * Availability = total usable units for the SKU minus units committed to
 * non-cancelled orders whose window overlaps [from, to]. Overlap is computed
 * with SQL's OVERLAPS operator so this scales to a table scan-free index
 * lookup rather than looping over orders in application code. The booking's
 * window (falling back to the order's window) is what's compared, since a
 * booking can override the order-level start/end.
 */
export async function getSkuAvailability(
  storeId: string,
  skuId: string,
  from: Date,
  to: Date,
  client: Tx | typeof prisma = prisma
): Promise<SkuAvailability> {
  const sku = await client.sku.findFirstOrThrow({ where: { id: skuId, storeId } });

  if (sku.trackedIndividually) {
    const totalArticles = await client.article.count({
      where: { storeId, skuId, status: "IN_USE" },
    });

    const reservedRows = await client.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT ol."articleId") as count
      FROM order_lines ol
      JOIN order_bookings ob ON ob.id = ol."bookingId"
      JOIN orders o ON o.id = ob."orderId"
      WHERE ol."skuId" = ${skuId}
        AND ol."articleId" IS NOT NULL
        AND o.status != 'CANCELLED'
        AND (COALESCE(ob."startAt", o."startAt"), CASE
          WHEN o.status = 'ACTIVE' THEN GREATEST(COALESCE(ob."endAt", o."endAt"), now() AT TIME ZONE 'UTC')
          WHEN o.status = 'COMPLETED' AND o."endedAt" IS NOT NULL THEN LEAST(COALESCE(ob."endAt", o."endAt"), o."endedAt")
          ELSE COALESCE(ob."endAt", o."endAt")
        END) OVERLAPS (${from}, ${to})
    `;
    const reserved = Number(reservedRows[0]?.count ?? 0);

    return { skuId, trackedIndividually: true, total: totalArticles, reserved, available: Math.max(0, totalArticles - reserved) };
  }

  const totalRow = await client.article.aggregate({
    where: { storeId, skuId, status: "IN_USE" },
    _sum: { quantity: true },
  });
  const total = totalRow._sum.quantity ?? 0;

  const reservedRows = await client.$queryRaw<{ sum: bigint | null }[]>`
    SELECT COALESCE(SUM(ol.quantity), 0) as sum
    FROM order_lines ol
    JOIN order_bookings ob ON ob.id = ol."bookingId"
    JOIN orders o ON o.id = ob."orderId"
    WHERE ol."skuId" = ${skuId}
      AND o.status != 'CANCELLED'
      AND (COALESCE(ob."startAt", o."startAt"), CASE
          WHEN o.status = 'ACTIVE' THEN GREATEST(COALESCE(ob."endAt", o."endAt"), now() AT TIME ZONE 'UTC')
          WHEN o.status = 'COMPLETED' AND o."endedAt" IS NOT NULL THEN LEAST(COALESCE(ob."endAt", o."endAt"), o."endedAt")
          ELSE COALESCE(ob."endAt", o."endAt")
        END) OVERLAPS (${from}, ${to})
  `;
  const reserved = Number(reservedRows[0]?.sum ?? 0);

  return { skuId, trackedIndividually: false, total, reserved, available: Math.max(0, total - reserved) };
}

/**
 * Locks the SKU row (SELECT ... FOR UPDATE) so concurrent order-creation
 * transactions for the same SKU serialize instead of racing on the
 * availability check-then-insert.
 */
export async function lockSkuForBooking(tx: Tx, skuId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM skus WHERE id = ${skuId} FOR UPDATE`;
}

/** Picks `count` free article ids for a tracked-individually SKU within [from, to], locking them. */
export async function pickAvailableArticleIds(
  tx: Tx,
  storeId: string,
  skuId: string,
  from: Date,
  to: Date,
  count: number
): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT a.id
    FROM articles a
    WHERE a."storeId" = ${storeId}
      AND a."skuId" = ${skuId}
      AND a.status = 'IN_USE'
      AND a.id NOT IN (
        SELECT ol."articleId"
        FROM order_lines ol
        JOIN order_bookings ob ON ob.id = ol."bookingId"
        JOIN orders o ON o.id = ob."orderId"
        WHERE ol."skuId" = ${skuId}
          AND ol."articleId" IS NOT NULL
          AND o.status != 'CANCELLED'
          AND (COALESCE(ob."startAt", o."startAt"), CASE
          WHEN o.status = 'ACTIVE' THEN GREATEST(COALESCE(ob."endAt", o."endAt"), now() AT TIME ZONE 'UTC')
          WHEN o.status = 'COMPLETED' AND o."endedAt" IS NOT NULL THEN LEAST(COALESCE(ob."endAt", o."endAt"), o."endedAt")
          ELSE COALESCE(ob."endAt", o."endAt")
        END) OVERLAPS (${from}, ${to})
      )
    ORDER BY a."articleCode"
    LIMIT ${count}
    FOR UPDATE SKIP LOCKED
  `;
  return rows.map((r) => r.id);
}

export type VariantAvailability = {
  variantId: string;
  available: number;
  slots: { slotId: string; skuIds: string[]; available: number }[];
};

/**
 * A variant's bookable count is bottlenecked by whichever resource slot has
 * the least availability. A slot's own availability is the sum across its
 * alternative SKUs (any one of them can fill the slot).
 */
export async function getVariantAvailability(
  storeId: string,
  variantId: string,
  from: Date,
  to: Date,
  client: Tx | typeof prisma = prisma
): Promise<VariantAvailability> {
  const slots = await client.variantResourceSlot.findMany({
    where: { variantId },
    include: { options: true },
    orderBy: { slotIndex: "asc" },
  });

  const slotAvailabilities = await Promise.all(
    slots.map(async (slot) => {
      const skuIds = slot.options.map((o) => o.skuId);
      const results = await Promise.all(skuIds.map((skuId) => getSkuAvailability(storeId, skuId, from, to, client)));
      const available = results.reduce((sum, r) => sum + r.available, 0);
      return { slotId: slot.id, skuIds, available: Math.floor(available / slot.quantity) };
    })
  );

  const available = slotAvailabilities.length > 0 ? Math.min(...slotAvailabilities.map((s) => s.available)) : 0;

  return { variantId, available, slots: slotAvailabilities };
}

/**
 * Picks and locks concrete SKUs (and, for individually-tracked SKUs,
 * specific articles) to fulfill `quantity` bookings of one resource slot,
 * trying each alternative SKU in order until enough units are found.
 */
export type SlotPick = { skuId: string; articleId: string | null; quantity: number };

export async function pickSkusForSlot(
  tx: Tx,
  storeId: string,
  slotId: string,
  from: Date,
  to: Date,
  quantity: number
): Promise<SlotPick[]> {
  const slot = await tx.variantResourceSlot.findUniqueOrThrow({
    where: { id: slotId },
    include: { options: { include: { sku: true } } },
  });

  const picks: SlotPick[] = [];
  let remaining = quantity * slot.quantity;

  for (const option of slot.options) {
    if (remaining <= 0) break;
    await lockSkuForBooking(tx, option.skuId);

    if (option.sku.trackedIndividually) {
      const articleIds = await pickAvailableArticleIds(tx, storeId, option.skuId, from, to, remaining);
      for (const articleId of articleIds) picks.push({ skuId: option.skuId, articleId, quantity: 1 });
      remaining -= articleIds.length;
    } else {
      const availability = await getSkuAvailability(storeId, option.skuId, from, to, tx);
      const take = Math.min(availability.available, remaining);
      if (take > 0) {
        picks.push({ skuId: option.skuId, articleId: null, quantity: take });
        remaining -= take;
      }
    }
  }

  if (remaining > 0) {
    throw new Error(`Not enough availability for slot ${slotId}`);
  }

  return picks;
}

/**
 * Whether `articleId` is free to be manually assigned to `excludeLineId`'s
 * window — i.e. not already reserved by some *other* order line whose
 * booking window overlaps it. Used when staff override which physical unit
 * fulfills a booking (TWICE's admin lets staff type/pick a serial per line
 * rather than always trusting the automatic pick).
 */
export async function isArticleFreeForWindow(
  storeId: string,
  articleId: string,
  from: Date,
  to: Date,
  excludeLineId: string,
  client: Tx | typeof prisma = prisma
): Promise<boolean> {
  const article = await client.article.findFirst({ where: { id: articleId, storeId, status: "IN_USE" } });
  if (!article) return false;

  const rows = await client.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM order_lines ol
    JOIN order_bookings ob ON ob.id = ol."bookingId"
    JOIN orders o ON o.id = ob."orderId"
    WHERE ol."articleId" = ${articleId}
      AND ol.id != ${excludeLineId}
      AND o.status != 'CANCELLED'
      AND (COALESCE(ob."startAt", o."startAt"), CASE
          WHEN o.status = 'ACTIVE' THEN GREATEST(COALESCE(ob."endAt", o."endAt"), now() AT TIME ZONE 'UTC')
          WHEN o.status = 'COMPLETED' AND o."endedAt" IS NOT NULL THEN LEAST(COALESCE(ob."endAt", o."endAt"), o."endedAt")
          ELSE COALESCE(ob."endAt", o."endAt")
        END) OVERLAPS (${from}, ${to})
  `;
  return Number(rows[0]?.count ?? 0) === 0;
}

/**
 * All in-use articles for a SKU that are free for [from, to] — i.e. the real
 * candidate pool for a manual serial reassignment, not every unit the store
 * owns. `excludeLineId`'s own current article is always included (even if it
 * would otherwise show as reserved by itself) so the picker doesn't drop the
 * line's existing assignment.
 */
export async function getFreeArticlesForSku(
  storeId: string,
  skuId: string,
  from: Date,
  to: Date,
  excludeLineId: string,
  client: Tx | typeof prisma = prisma
): Promise<{ id: string; articleCode: string }[]> {
  const rows = await client.$queryRaw<{ id: string; articleCode: string }[]>`
    SELECT a.id, a."articleCode"
    FROM articles a
    WHERE a."storeId" = ${storeId}
      AND a."skuId" = ${skuId}
      AND a.status = 'IN_USE'
      AND (
        a.id NOT IN (
          SELECT ol."articleId"
          FROM order_lines ol
          JOIN order_bookings ob ON ob.id = ol."bookingId"
          JOIN orders o ON o.id = ob."orderId"
          WHERE ol."skuId" = ${skuId}
            AND ol."articleId" IS NOT NULL
            AND ol.id != ${excludeLineId}
            AND o.status != 'CANCELLED'
            AND (COALESCE(ob."startAt", o."startAt"), CASE
          WHEN o.status = 'ACTIVE' THEN GREATEST(COALESCE(ob."endAt", o."endAt"), now() AT TIME ZONE 'UTC')
          WHEN o.status = 'COMPLETED' AND o."endedAt" IS NOT NULL THEN LEAST(COALESCE(ob."endAt", o."endAt"), o."endedAt")
          ELSE COALESCE(ob."endAt", o."endAt")
        END) OVERLAPS (${from}, ${to})
        )
        OR a.id = (SELECT "articleId" FROM order_lines WHERE id = ${excludeLineId})
      )
    ORDER BY a."articleCode"
  `;
  return rows;
}
