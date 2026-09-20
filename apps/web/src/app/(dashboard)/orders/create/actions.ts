"use server";

import { requireSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { prisma } from "@thrice/db";
import { sendOrderConfirmation } from "@/lib/order-email";
import { createOrder, InsufficientAvailabilityError, NoPriceTierError, OutsideOpeningHoursError } from "@/lib/orders";
import { logger } from "@/lib/logger";
import { createOrderSchema } from "@thrice/shared";

export type CreateOrderState = { error?: string; orderNumber?: number };

export async function createOrderAction(
  _prevState: CreateOrderState,
  formData: FormData
): Promise<CreateOrderState> {
  const user = await requireSessionUser();
  const store = await getCurrentStore(user);
  if (!store) return { error: "No store selected." };

  const raw = formData.get("payload");
  if (typeof raw !== "string") return { error: "Missing order payload." };

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { error: "Malformed order payload." };
  }

  const parsed = createOrderSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid order." };
  }

  try {
    const order = await createOrder(store.storeId, user.id, parsed.data);
    const row = await prisma.store.findUnique({ where: { id: store.storeId }, select: { sendConfirmationOnCreate: true } });
    if (row?.sendConfirmationOnCreate) {
      // Best effort: a missing address or SMTP problem must never fail an order that already exists.
      const sent = await sendOrderConfirmation(store.storeId, order.id);
      if (!sent.ok) logger.info({ orderId: order.id, reason: sent.reason }, "auto confirmation email skipped");
    }
    return { orderNumber: order.orderNumber };
  } catch (err) {
    if (err instanceof InsufficientAvailabilityError || err instanceof NoPriceTierError || err instanceof OutsideOpeningHoursError) {
      return { error: err.message };
    }
    logger.error({ err, storeId: store.storeId, userId: user.id }, "createOrderAction failed");
    return { error: "Could not create the order. Please try again." };
  }
}
