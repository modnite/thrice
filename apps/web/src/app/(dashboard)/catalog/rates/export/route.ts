import { NextResponse } from "next/server";
import { prisma } from "@thrice/db";
import { ratesToCsv } from "@thrice/shared";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";

// Every product variant with its current rates, in the same format the import reads back.
// Variants with no rates yet appear as one blank row, so this is also the template to fill in.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const membership = await getCurrentStore(user);
  if (!membership || membership.role === "STAFF") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const variants = await prisma.productVariant.findMany({
    where: { storeId: membership.storeId },
    include: { product: { select: { name: true } }, priceTiers: { orderBy: { displayOrder: "asc" } } },
    orderBy: [{ product: { name: "asc" } }, { displayOrder: "asc" }, { name: "asc" }],
  });

  const csv = ratesToCsv(
    variants.map((v) => ({
      product: v.product.name,
      variant: v.name,
      mode: v.pricingMode,
      rows: v.priceTiers.map((t) => ({
        durationMinutes: t.durationMinutes,
        price: Number(t.price),
        additionalPrice: t.additionalPrice === null ? null : Number(t.additionalPrice),
      })),
    }))
  );

  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rates-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
