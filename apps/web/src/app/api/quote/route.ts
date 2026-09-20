import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@thrice/db";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { quoteVariantPrice } from "@/lib/pricing";

// Per-unit price for each requested variant over a window, computed with the same
// engine that prices real bookings, so the cart never disagrees with the order.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const store = await getCurrentStore(user);
  if (!store) return NextResponse.json({ error: "NO_STORE" }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const variantIds = sp.get("variantIds")?.split(",").filter(Boolean) ?? [];
  const from = new Date(sp.get("from") ?? "");
  const to = new Date(sp.get("to") ?? "");
  if (variantIds.length === 0 || variantIds.length > 100 || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }

  // Only variants that belong to this store.
  const owned = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, storeId: store.storeId },
    select: { id: true },
  });

  const quotes = await Promise.all(
    owned.map(async (v) => {
      const quote = await quoteVariantPrice(v.id, from, to);
      return { variantId: v.id, price: quote ? quote.total : null, blocks: quote?.blocks ?? [] };
    })
  );
  return NextResponse.json({ quotes });
}
