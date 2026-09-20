import { prisma } from "@thrice/db";
import { apiError, authenticate, isResponse, json, WEBSITE_NOTE_PREFIX } from "@/lib/public-api";
import { logger } from "@/lib/logger";

// DELETE /api/public/v1/orders/:id  -> 204
// Cancels an order the website created. It can never touch a staff order: the order must be an ONLINE-channel
// order whose notes carry the website marker, and only Upcoming ones may be cancelled here (once staff have
// started a rental it is theirs to end).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authenticate(req);
  if (isResponse(ctx)) return ctx;
  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: { id, storeId: ctx.storeId, channel: "ONLINE", notes: { startsWith: WEBSITE_NOTE_PREFIX } },
    select: { id: true, status: true },
  });
  if (!order) return apiError(404, "NOT_FOUND", "No such website order.");
  if (order.status === "CANCELLED") return new Response(null, { status: 204 });
  if (order.status !== "UPCOMING") return apiError(409, "NOT_CANCELLABLE", "Only upcoming orders can be cancelled here.");

  await prisma.order.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  await prisma.auditLog.create({ data: { storeId: ctx.storeId, userId: ctx.actorUserId, action: "ORDER_CANCELLED", entityType: "Order", entityId: id, diff: { via: "public-api" } } });
  logger.info({ orderId: id }, "public api: website booking cancelled");
  return new Response(null, { status: 204 });
}
