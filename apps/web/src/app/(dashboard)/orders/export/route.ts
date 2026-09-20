import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@thrice/db";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { buildOrderBy, buildOrdersWhere, type Tab } from "@/lib/order-filters";

const MAX_ROWS = 10_000;

// Neutralise spreadsheet formulas ("=", "+", "-", "@") and quote anything that needs it.
function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const membership = await getCurrentStore(user);
  if (!membership) return NextResponse.json({ error: "NO_STORE" }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const store = await prisma.store.findUniqueOrThrow({ where: { id: membership.storeId }, select: { timezone: true } });
  const tz = store.timezone;
  const idsRaw = sp.get("ids");

  const params = {
    q: sp.get("q") ?? undefined,
    range: sp.get("range") ?? undefined,
    delivery: sp.get("delivery") ?? undefined,
    payment: sp.get("payment") ?? undefined,
    type: sp.get("type") ?? undefined,
    product: sp.get("product") ?? undefined,
    f: sp.getAll("f"),
    ids: idsRaw ? idsRaw.split(",").filter(Boolean) : undefined,
    sort: sp.get("sort") ?? undefined,
    dir: sp.get("dir") ?? undefined,
  };

  // One tab, or "all" for every rental (Upcoming, then Active, then Completed).
  const tabParam = sp.get("tab");
  const tabs: Tab[] =
    tabParam === "upcoming" || tabParam === "active" || tabParam === "completed"
      ? [tabParam]
      : tabParam === "all"
        ? ["upcoming", "active", "completed"]
        : ["completed"];

  const include = {
    persons: true,
    deposit: true,
    bookings: { include: { product: true, lines: { include: { article: true } } } },
  } as const;
  const orders = (
    await Promise.all(
      tabs.map((t) =>
        prisma.order.findMany({
          where: buildOrdersWhere(membership.storeId, t, params, tz),
          include,
          orderBy: buildOrderBy(t, params.sort, params.dir),
          take: MAX_ROWS,
        })
      )
    )
  ).flat();

  const stamp = (d: Date | null) => (d ? d.toLocaleString("sv-SE", { timeZone: tz }).slice(0, 16) : "");
  const header = [
    "Order number",
    "Customer",
    "Type",
    "Status",
    "Payment",
    "Payment method",
    "Payment reference",
    "Total",
    "Currency",
    "Products",
    "Serials",
    "Deposit",
    "Return",
    "Created",
    "Start",
    "End",
    "Started",
    "Ended",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const o of orders) {
    const customer = (o.persons.find((p) => p.isLiableCustomer) ?? o.persons[0])?.name ?? "";
    const products = o.bookings.map((b) => (b.quantity > 1 ? `${b.product.name} x${b.quantity}` : b.product.name)).join("; ");
    lines.push(
      [
        o.orderNumber,
        customer,
        o.type,
        o.status,
        o.paymentStatus,
        o.paymentMethod ?? "",
        o.paymentReference ?? "",
        Number(o.totalPrice).toFixed(2),
        o.currency,
        products,
        o.bookings
          .flatMap((b) => b.lines.map((l) => l.article?.articleCode))
          .filter(Boolean)
          .join("; "),
        o.deposit ? `${Number(o.deposit.amount).toFixed(2)} ${o.deposit.status}` : "",
        o.returnMethod === "PICKUP" ? "Pickup" : "Return to store",
        stamp(o.createdAt),
        stamp(o.startAt),
        stamp(o.endAt),
        stamp(o.startedAt),
        stamp(o.endedAt),
      ]
        .map(csvCell)
        .join(",")
    );
  }

  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rentals-${tabs.length > 1 ? "all" : tabs[0]}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
