import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { getVariantAvailability } from "@/lib/availability";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const store = await getCurrentStore(user);
  if (!store) return NextResponse.json({ error: "NO_STORE" }, { status: 400 });

  const { searchParams } = req.nextUrl;
  const variantIds = searchParams.get("variantIds")?.split(",").filter(Boolean) ?? [];
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to || variantIds.length === 0) {
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate <= fromDate) {
    return NextResponse.json({ error: "INVALID_RANGE" }, { status: 400 });
  }

  if (variantIds.length > 100) return NextResponse.json({ error: "TOO_MANY_VARIANTS" }, { status: 400 });

  const results = await Promise.all(
    variantIds.map((variantId) => getVariantAvailability(store.storeId, variantId, fromDate, toDate))
  );

  return NextResponse.json({ availability: results });
}
