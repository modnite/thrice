import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { createBackup } from "@/lib/backup";
import { prisma } from "@thrice/db";

export const dynamic = "force-dynamic";

// Downloads a backup of the current store's business data. Owners and admins only.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const membership = await getCurrentStore(user);
  if (!membership || membership.role === "STAFF") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { file, name, counts } = await createBackup(membership.storeId);
  await prisma.auditLog.create({
    data: { storeId: membership.storeId, userId: user.id, action: "BACKUP_DOWNLOADED", entityType: "Store", entityId: membership.storeId, diff: { counts } },
  });
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
