"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@thrice/db";
import { parseOrdersCsv } from "@thrice/shared";
import { requireSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { importOrders, type OrderImportResult } from "@/lib/order-import";

export type OrdersImportState = {
  error?: string;
  dryRun?: boolean;
  results?: OrderImportResult[];
  parseErrors?: string[];
};

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ORDERS = 3000;

export async function importOrdersAction(_prev: OrdersImportState, formData: FormData): Promise<OrdersImportState> {
  const user = await requireSessionUser();
  const membership = await getCurrentStore(user);
  if (!membership || membership.role === "STAFF") throw new Error("FORBIDDEN");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file first." };
  if (file.size > MAX_BYTES) return { error: "That file is too large (5 MB limit)." };
  const dryRun = formData.get("mode") !== "import";

  const store = await prisma.store.findUniqueOrThrow({ where: { id: membership.storeId }, select: { timezone: true } });
  const { orders, errors } = parseOrdersCsv(await file.text(), store.timezone);
  if (orders.length > MAX_ORDERS) return { error: `Import at most ${MAX_ORDERS} orders at a time.` };

  const results = await importOrders(membership.storeId, user.id, orders, dryRun);
  if (!dryRun) {
    const imported = results.filter((r) => r.outcome === "imported").length;
    await prisma.auditLog.create({
      data: {
        storeId: membership.storeId,
        userId: user.id,
        action: "ORDERS_IMPORTED",
        entityType: "Store",
        entityId: membership.storeId,
        diff: { imported, skipped: results.filter((r) => r.outcome === "skipped").length, failed: results.filter((r) => r.outcome === "error").length },
      },
    });
    revalidatePath("/orders");
  }
  return { dryRun, results, parseErrors: errors.map((e) => `Line ${e.line}: ${e.message}`) };
}
