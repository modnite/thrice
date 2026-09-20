import { NextResponse } from "next/server";
import { ORDERS_TEMPLATE_CSV } from "@thrice/shared";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const membership = await getCurrentStore(user);
  if (!membership || membership.role === "STAFF") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  return new NextResponse("﻿" + ORDERS_TEMPLATE_CSV, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="orders-import-template.csv"',
    },
  });
}
