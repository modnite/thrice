import { NextResponse } from "next/server";
import { prisma } from "@thrice/db";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { BackupError, parseBackup, restoreBackup } from "@/lib/backup";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

// Restores a backup file into an empty store. Owners and admins only.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const membership = await getCurrentStore(user);
  if (!membership || membership.role === "STAFF") return NextResponse.json({ error: "Only owners and admins can restore a backup." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a backup file first." }, { status: 400 });
  if (file.size > 500 * 1024 * 1024) return NextResponse.json({ error: "That file is too large." }, { status: 400 });

  try {
    const backup = parseBackup(Buffer.from(await file.arrayBuffer()));
    const counts = await restoreBackup(membership.storeId, backup);
    await prisma.auditLog.create({
      data: { storeId: membership.storeId, userId: user.id, action: "BACKUP_RESTORED", entityType: "Store", entityId: membership.storeId, diff: { from: backup.storeName, exportedAt: backup.exportedAt, counts } },
    });
    return NextResponse.json({ ok: true, counts, from: backup.storeName });
  } catch (err) {
    if (err instanceof BackupError) return NextResponse.json({ error: err.message }, { status: 400 });
    logger.error({ err }, "backup restore failed");
    return NextResponse.json({ error: "The restore failed and nothing was changed. See the server log for details." }, { status: 500 });
  }
}
