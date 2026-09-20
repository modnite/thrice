import type { Prisma } from "@thrice/db";
import { DATE_PRESET_KEYS, resolveDatePreset, zonedDayStart, type DatePresetKey } from "@thrice/shared";

export type Tab = "upcoming" | "active" | "completed";

export const ORDER_TYPES = ["BOOKING", "SALE", "SUBSCRIPTION", "BUYBACK"] as const;

export type OrderListParams = {
  q?: string;
  range?: string;
  delivery?: string;
  prepared?: string;
  payment?: string;
  type?: string;
  product?: string;
  return?: string;
  f?: string[];
  ids?: string[];
  sort?: string;
  dir?: string;
};


const DATE_FIELDS: Record<string, "createdAt" | "startAt" | "endAt"> = {
  created: "createdAt",
  start: "startAt",
  end: "endAt",
};

/** Translates the `f=field~op~value` rows of the filter builder into Prisma conditions. */
export function advancedFilters(rows: string[] | undefined, timeZone: string): Prisma.OrderWhereInput[] {
  const out: Prisma.OrderWhereInput[] = [];
  for (const row of rows ?? []) {
    const [field, op, ...rest] = row.split("~");
    const value = rest.join("~").trim();
    if (!value) continue;

    if (field === "customer" && op === "contains") {
      out.push({ persons: { some: { name: { contains: value, mode: "insensitive" } } } });
    } else if (field === "product" && op === "contains") {
      out.push({ bookings: { some: { product: { name: { contains: value, mode: "insensitive" } } } } });
    } else if (field === "payment" && op === "is" && (value === "paid" || value === "unpaid")) {
      out.push({ paymentStatus: value === "paid" ? "PAID" : "UNPAID" });
    } else if (field === "status" && op === "is" && (value === "completed" || value === "cancelled")) {
      out.push({ status: value === "completed" ? "COMPLETED" : "CANCELLED" });
    } else if (field === "type" && op === "is" && (ORDER_TYPES as readonly string[]).includes(value)) {
      out.push({ type: value as (typeof ORDER_TYPES)[number] });
    } else if (field === "price" && Number.isFinite(Number(value))) {
      const n = Number(value);
      if (op === "gt") out.push({ totalPrice: { gt: n } });
      else if (op === "lt") out.push({ totalPrice: { lt: n } });
      else if (op === "eq") out.push({ totalPrice: { equals: n } });
    } else if (field in DATE_FIELDS && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const column = DATE_FIELDS[field];
      const dayStart = zonedDayStart(value, timeZone);
      const nextDay = new Date(dayStart.getTime() + 24 * 3600_000);
      if (op === "before") out.push({ [column]: { lt: dayStart } });
      else if (op === "after") out.push({ [column]: { gte: nextDay } });
    }
  }
  return out;
}

/** The single source of truth for what each Orders tab shows, shared by the page and the CSV export. */
export function buildOrdersWhere(storeId: string, tab: Tab, p: OrderListParams, timeZone: string): Prisma.OrderWhereInput {
  const dateFilter =
    p.range && (DATE_PRESET_KEYS as readonly string[]).includes(p.range) ? resolveDatePreset(p.range as DatePresetKey) : null;
  const dateField = tab === "upcoming" ? "startAt" : "endAt";
  const type = ORDER_TYPES.find((t) => t === p.type);

  const q = p.q?.trim();
  const and: Prisma.OrderWhereInput[] = [];
  if (q) {
    and.push({
      OR: [
        { persons: { some: { name: { contains: q, mode: "insensitive" } } } },
        { bookings: { some: { product: { name: { contains: q, mode: "insensitive" } } } } },
        { bookings: { some: { lines: { some: { article: { articleCode: { contains: q, mode: "insensitive" } } } } } } },
        ...(/^\d+$/.test(q) ? [{ orderNumber: Number(q) }] : []),
      ],
    });
  }
  and.push(...advancedFilters(p.f, timeZone));

  return {
    storeId,
    status:
      tab === "upcoming" ? "UPCOMING" : tab === "active" ? "ACTIVE" : { in: ["COMPLETED", "CANCELLED"] },
    ...(type ? { type } : {}),
    ...(dateFilter ? { [dateField]: { gte: dateFilter.from, lte: dateFilter.to } } : {}),
    ...(p.delivery === "yes" ? { deliveryRequired: true } : p.delivery === "no" ? { deliveryRequired: false } : {}),
    ...(tab === "upcoming" && p.prepared === "yes" ? { prepared: true } : {}),
    ...(tab === "upcoming" && p.prepared === "no" ? { prepared: false } : {}),
    ...(tab !== "upcoming" && p.payment === "paid" ? { paymentStatus: "PAID" } : {}),
    ...(tab !== "upcoming" && p.payment === "unpaid" ? { paymentStatus: "UNPAID" } : {}),
    ...(tab === "active" && (p.return === "STORE" || p.return === "PICKUP") ? { returnMethod: p.return } : {}),
    ...(p.product ? { bookings: { some: { productId: p.product } } } : {}),
    ...(p.ids && p.ids.length > 0 ? { id: { in: p.ids } } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

export const SORT_COLUMNS: Record<string, keyof Prisma.OrderOrderByWithRelationInput> = {
  number: "orderNumber",
  completed: "endedAt",
  status: "status",
  payment: "paymentStatus",
  price: "totalPrice",
  type: "type",
  created: "createdAt",
  start: "startAt",
  end: "endAt",
};

export function buildOrderBy(tab: Tab, sort?: string, dir?: string): Prisma.OrderOrderByWithRelationInput[] {
  const column = sort ? SORT_COLUMNS[sort] : undefined;
  if (column) {
    const direction = dir === "asc" ? "asc" : "desc";
    // Only the nullable column (actual end time, unset on cancelled orders) takes a nulls option.
    const value = column === "endedAt" ? { sort: direction, nulls: "last" } : direction;
    return [{ [column]: value } as Prisma.OrderOrderByWithRelationInput, { orderNumber: "desc" }];
  }
  if (tab === "completed") return [{ endAt: "desc" }, { orderNumber: "desc" }];
  return [{ [tab === "upcoming" ? "startAt" : "endAt"]: "asc" } as Prisma.OrderOrderByWithRelationInput, { orderNumber: "asc" }];
}
