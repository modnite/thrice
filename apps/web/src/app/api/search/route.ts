import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@thrice/db";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";

type Hit = { type: "order" | "customer" | "product" | "stock"; label: string; sub: string; href: string };

const LIMIT = 5;

// Global search (Ctrl+K): orders by number, customer or serial; customers; products; stock items.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const membership = await getCurrentStore(user);
  if (!membership) return NextResponse.json({ error: "NO_STORE" }, { status: 400 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ hits: [] satisfies Hit[] });
  const storeId = membership.storeId;
  const contains = { contains: q, mode: "insensitive" as const };

  const [orders, customers, products, stock] = await Promise.all([
    prisma.order.findMany({
      where: {
        storeId,
        OR: [
          ...(/^\d+$/.test(q) ? [{ orderNumber: Number(q) }] : []),
          { persons: { some: { name: contains } } },
          { bookings: { some: { lines: { some: { article: { articleCode: contains } } } } } },
        ],
      },
      include: { persons: true },
      orderBy: { orderNumber: "desc" },
      take: LIMIT,
    }),
    prisma.customer.findMany({
      where: { storeId, OR: [{ name: contains }, { email: contains }, { phone: contains }, { company: contains }] },
      orderBy: { name: "asc" },
      take: LIMIT,
    }),
    prisma.product.findMany({ where: { storeId, name: contains }, orderBy: { name: "asc" }, take: LIMIT }),
    prisma.article.findMany({
      where: { storeId, OR: [{ articleCode: contains }, { sku: { code: contains } }] },
      include: { sku: true },
      orderBy: { articleCode: "asc" },
      take: LIMIT,
    }),
  ]);

  const isAdmin = membership.role !== "STAFF";
  const hits: Hit[] = [
    ...orders.map((o) => ({
      type: "order" as const,
      label: `Order #${o.orderNumber}`,
      sub: `${(o.persons.find((p) => p.isLiableCustomer) ?? o.persons[0])?.name ?? "Unknown"} · ${o.status.toLowerCase()}`,
      href: `/orders/${o.id}`,
    })),
    ...(isAdmin ? customers : []).map((c) => ({
      type: "customer" as const,
      label: c.name,
      sub: [c.company, c.email, c.phone].filter(Boolean).join(" · ") || "Customer",
      href: `/customers/${c.id}`,
    })),
    ...(isAdmin ? products : []).map((p) => ({ type: "product" as const, label: p.name, sub: "Product", href: `/catalog/products/${p.id}` })),
    ...stock.map((a) => ({
      type: "stock" as const,
      label: a.articleCode,
      sub: a.sku.name,
      href: `/inventory?q=${encodeURIComponent(a.articleCode)}`,
    })),
  ];
  return NextResponse.json({ hits });
}
