"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@thrice/db";
import { requireSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { logger } from "@/lib/logger";
import { isArticleFreeForWindow } from "@/lib/availability";
import { sendOrderConfirmation } from "@/lib/order-email";
import { syncDeposit } from "@/lib/deposits";
import { enabledPaymentLabels, holidaysSchema, isWithinOpeningHours, openingHoursSchema, resolvePaymentMethods } from "@thrice/shared";
import {
  addBookingToOrder,
  applyDiscount,
  duplicateOrder,
  InsufficientAvailabilityError,
  NoPriceTierError,
  OrderNotEditableError,
  rescheduleOrder,
} from "@/lib/orders";

async function requireOrder(orderId: string) {
  const user = await requireSessionUser();
  const store = await getCurrentStore(user);
  if (!store) throw new Error("NO_STORE");

  const order = await prisma.order.findFirstOrThrow({ where: { id: orderId, storeId: store.storeId } });
  return { user, store, order };
}

async function audit(storeId: string, userId: string, action: string, orderId: string, diff?: object) {
  await prisma.auditLog.create({
    data: { storeId, userId, action, entityType: "Order", entityId: orderId, diff },
  });
}

export async function setPreparedAction(orderId: string, prepared: boolean) {
  const { user, store } = await requireOrder(orderId);
  await prisma.order.update({ where: { id: orderId }, data: { prepared } });
  await audit(store.storeId, user.id, prepared ? "ORDER_PREPARED" : "ORDER_UNPREPARED", orderId);
  revalidatePath(`/orders/${orderId}`);
}

export async function setPaymentStatusAction(orderId: string, status: "PAID" | "UNPAID") {
  const { user, store } = await requireOrder(orderId);
  await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: status } });
  await audit(store.storeId, user.id, `ORDER_MARKED_${status}`, orderId);
  revalidatePath(`/orders/${orderId}`);
}

export async function startOrderAction(orderId: string) {
  const { user, store, order } = await requireOrder(orderId);
  if (order.status !== "UPCOMING") return;
  await prisma.order.update({ where: { id: orderId }, data: { status: "ACTIVE", startedAt: new Date() } });
  await audit(store.storeId, user.id, "ORDER_STARTED", orderId);
  revalidatePath(`/orders/${orderId}`);
}

/** Cards that carry items: a person owns theirs, unassigned items belong to the liable customer. */
async function personsWithItems(orderId: string) {
  const [persons, bookings] = await Promise.all([
    prisma.orderPerson.findMany({ where: { orderId } }),
    prisma.orderBooking.findMany({ where: { orderId }, select: { personId: true } }),
  ]);
  const liable = persons.find((p) => p.isLiableCustomer) ?? persons[0];
  const owners = new Set(bookings.map((b) => b.personId ?? liable?.id).filter(Boolean) as string[]);
  return { persons, owners };
}

async function completeOrder(orderId: string, at: Date) {
  await prisma.$transaction([
    prisma.orderPerson.updateMany({ where: { orderId, endedAt: null }, data: { endedAt: at } }),
    prisma.order.update({ where: { id: orderId }, data: { status: "COMPLETED", endedAt: at } }),
  ]);
}

export async function endOrderAction(orderId: string) {
  const { user, store, order } = await requireOrder(orderId);
  if (order.status !== "ACTIVE") return;
  await completeOrder(orderId, new Date());
  await audit(store.storeId, user.id, "ORDER_ENDED", orderId);
  revalidatePath(`/orders/${orderId}`);
}

/** The "End order" switch on one person's card: returns their items; the order completes with the last one. */
export async function endPersonAction(orderId: string, personId: string) {
  const { user, store, order } = await requireOrder(orderId);
  if (order.status !== "ACTIVE") return;
  const now = new Date();
  await prisma.orderPerson.updateMany({ where: { id: personId, orderId, endedAt: null }, data: { endedAt: now } });

  const { persons, owners } = await personsWithItems(orderId);
  const allEnded = persons.filter((p) => owners.has(p.id)).every((p) => p.id === personId || p.endedAt);
  if (allEnded) await completeOrder(orderId, now);

  await audit(store.storeId, user.id, allEnded ? "ORDER_ENDED" : "PERSON_ENDED", orderId, { personId });
  revalidatePath(`/orders/${orderId}`);
}

/** "Cancel start": puts an Active order back to Upcoming. */
export async function cancelStartAction(orderId: string) {
  const { user, store, order } = await requireOrder(orderId);
  if (order.status !== "ACTIVE") return;
  await prisma.$transaction([
    prisma.orderPerson.updateMany({ where: { orderId }, data: { endedAt: null } }),
    prisma.order.update({ where: { id: orderId }, data: { status: "UPCOMING", startedAt: null } }),
  ]);
  await audit(store.storeId, user.id, "ORDER_START_CANCELLED", orderId);
  revalidatePath(`/orders/${orderId}`);
}

/** "Re-open order": a Completed order becomes Active again. */
export async function reopenOrderAction(orderId: string) {
  const { user, store, order } = await requireOrder(orderId);
  if (order.status !== "COMPLETED") return;
  await prisma.$transaction([
    prisma.orderPerson.updateMany({ where: { orderId }, data: { endedAt: null } }),
    prisma.order.update({ where: { id: orderId }, data: { status: "ACTIVE", endedAt: null } }),
  ]);
  await audit(store.storeId, user.id, "ORDER_REOPENED", orderId);
  revalidatePath(`/orders/${orderId}`);
}

export async function cancelOrderAction(orderId: string) {
  const { user, store, order } = await requireOrder(orderId);
  if (order.status === "CANCELLED" || order.status === "COMPLETED") return;
  await prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  await audit(store.storeId, user.id, "ORDER_CANCELLED", orderId);
  logger.info({ orderId, userId: user.id }, "order cancelled");
  revalidatePath(`/orders/${orderId}`);
}

export async function updateOrderNotesAction(orderId: string, formData: FormData) {
  const { user, store } = await requireOrder(orderId);
  const notes = String(formData.get("notes") ?? "").trim();
  await prisma.order.update({ where: { id: orderId }, data: { notes: notes || null } });
  await audit(store.storeId, user.id, "ORDER_NOTES_UPDATED", orderId);
  revalidatePath(`/orders/${orderId}`);
}

export async function updateBookingNotesAction(orderId: string, bookingId: string, formData: FormData) {
  const { user, store } = await requireOrder(orderId);
  const notes = String(formData.get("notes") ?? "").trim();
  await prisma.orderBooking.update({ where: { id: bookingId }, data: { notes: notes || null } });
  await audit(store.storeId, user.id, "BOOKING_NOTES_UPDATED", orderId, { bookingId });
  revalidatePath(`/orders/${orderId}`);
}

export async function setDiscountAction(orderId: string, formData: FormData) {
  const { user, store } = await requireOrder(orderId);
  const raw = String(formData.get("discountPercent") ?? "").trim();
  const discountPercent = raw === "" ? null : Math.max(0, Math.min(100, Number(raw)));

  const bookings = await prisma.orderBooking.findMany({ where: { orderId } });
  const baseTotal = bookings.reduce((sum, b) => sum + b.quantity * Number(b.priceEach), 0);
  const totalPrice = applyDiscount(baseTotal, discountPercent);

  await prisma.order.update({
    where: { id: orderId },
    data: { discountPercent: discountPercent ?? null, totalPrice },
  });
  await audit(store.storeId, user.id, "ORDER_DISCOUNT_SET", orderId, { discountPercent });
  revalidatePath(`/orders/${orderId}`);
}

export async function reassignArticleAction(orderId: string, lineId: string, formData: FormData) {
  const { user, store } = await requireOrder(orderId);
  const articleId = String(formData.get("articleId") ?? "");

  const line = await prisma.orderLine.findFirstOrThrow({
    where: { id: lineId, booking: { orderId } },
    include: { booking: { include: { order: true } } },
  });

  const from = line.booking.startAt ?? line.booking.order.startAt;
  const to = line.booking.endAt ?? line.booking.order.endAt;

  const free = await isArticleFreeForWindow(store.storeId, articleId, from, to, lineId);
  if (!free) {
    logger.warn({ orderId, lineId, articleId }, "reassignArticleAction: article not free, ignoring");
    return;
  }

  await prisma.orderLine.update({ where: { id: lineId }, data: { articleId } });
  await audit(store.storeId, user.id, "ORDER_LINE_ARTICLE_REASSIGNED", orderId, { lineId, articleId });
  revalidatePath(`/orders/${orderId}`);
}

export type EmailState = { error?: string; message?: string };

/** The mail icon: sends the confirmation and tells staff exactly what happened. */
export async function sendConfirmationEmailAction(orderId: string, _prev: EmailState): Promise<EmailState> {
  const { store } = await requireOrder(orderId);
  const result = await sendOrderConfirmation(store.storeId, orderId);
  revalidatePath(`/orders/${orderId}`);
  return result.ok ? { message: `Confirmation sent to ${result.to}.` } : { error: result.reason };
}

export type AddProductState = { error?: string };

export async function addProductToOrderAction(
  orderId: string,
  _prevState: AddProductState,
  formData: FormData
): Promise<AddProductState> {
  const { user, store } = await requireOrder(orderId);

  const variantId = String(formData.get("variantId") ?? "");
  const quantity = Math.max(1, Number(formData.get("quantity") ?? 1));
  const personIndexRaw = formData.get("personId");
  const personId = personIndexRaw ? String(personIndexRaw) : undefined;

  try {
    await addBookingToOrder(store.storeId, user.id, orderId, { variantId, quantity, personId });
  } catch (err) {
    if (err instanceof InsufficientAvailabilityError || err instanceof NoPriceTierError) {
      return { error: err.message };
    }
    logger.error({ err, orderId }, "addProductToOrderAction failed");
    return { error: "Could not add that product to the order." };
  }
  revalidatePath(`/orders/${orderId}`);
  return {};
}

export async function updateBookingPriceAction(orderId: string, bookingId: string, formData: FormData) {
  const { user, store, order } = await requireOrder(orderId);
  const raw = String(formData.get("priceEach") ?? "").trim();
  const priceEach = Math.max(0, Number(raw) || 0);

  await prisma.orderBooking.update({ where: { id: bookingId }, data: { priceEach } });

  const bookings = await prisma.orderBooking.findMany({ where: { orderId } });
  const baseTotal = bookings.reduce((sum, b) => sum + b.quantity * Number(b.priceEach), 0);
  const totalPrice = applyDiscount(baseTotal, order.discountPercent ? Number(order.discountPercent) : null);
  await prisma.order.update({ where: { id: orderId }, data: { totalPrice } });

  await audit(store.storeId, user.id, "BOOKING_PRICE_UPDATED", orderId, { bookingId, priceEach });
  revalidatePath(`/orders/${orderId}`);
}

/**
 * Removes one unit of a booking (the "Edit → Delete" flow on a TWICE order card).
 * A booking of quantity N loses one unit and its fulfillment rows shrink by the
 * same per-unit share; a booking of quantity 1 is deleted outright. The order's
 * last remaining unit can't be removed, so an order is never left empty.
 */
export async function removeBookingUnitAction(orderId: string, bookingId: string) {
  const { user, store, order } = await requireOrder(orderId);
  if (order.status === "COMPLETED" || order.status === "CANCELLED") return;

  const bookings = await prisma.orderBooking.findMany({
    where: { orderId },
    include: { lines: { orderBy: { createdAt: "asc" } } },
  });
  const totalUnits = bookings.reduce((sum, b) => sum + b.quantity, 0);
  const booking = bookings.find((b) => b.id === bookingId);
  if (!booking || totalUnits <= 1) return;

  await prisma.$transaction(async (tx) => {
    if (booking.quantity <= 1) {
      await tx.orderLine.deleteMany({ where: { bookingId } });
      await tx.orderBooking.delete({ where: { id: bookingId } });
    } else {
      const bySlot = new Map<string, typeof booking.lines>();
      for (const l of booking.lines) {
        const key = l.slotId ?? l.skuId;
        bySlot.set(key, [...(bySlot.get(key) ?? []), l]);
      }
      for (const lines of bySlot.values()) {
        const total = lines.reduce((s, l) => s + l.quantity, 0);
        let need = Math.max(1, Math.round(total / booking.quantity));
        for (const l of [...lines].reverse()) {
          if (need <= 0) break;
          if (l.quantity <= need) {
            await tx.orderLine.delete({ where: { id: l.id } });
            need -= l.quantity;
          } else {
            await tx.orderLine.update({ where: { id: l.id }, data: { quantity: l.quantity - need } });
            need = 0;
          }
        }
      }
      await tx.orderBooking.update({ where: { id: bookingId }, data: { quantity: booking.quantity - 1 } });
    }

    const remaining = await tx.orderBooking.findMany({ where: { orderId } });
    const baseTotal = remaining.reduce((sum, b) => sum + b.quantity * Number(b.priceEach), 0);
    const totalPrice = applyDiscount(baseTotal, order.discountPercent ? Number(order.discountPercent) : null);
    await tx.order.update({ where: { id: orderId }, data: { totalPrice } });
    await syncDeposit(tx, orderId);
  });

  await audit(store.storeId, user.id, "BOOKING_UNIT_REMOVED", orderId, { bookingId });
  revalidatePath(`/orders/${orderId}`);
}

export async function setPaymentMethodAction(orderId: string, formData: FormData) {
  const { user, store, order } = await requireOrder(orderId);
  const chosen = String(formData.get("method") ?? "").trim();
  const row = await prisma.store.findUniqueOrThrow({ where: { id: store.storeId }, select: { paymentMethodConfig: true } });
  const offered = enabledPaymentLabels(resolvePaymentMethods(row.paymentMethodConfig));
  // Only an option the store currently offers can be newly chosen; an order may keep one it already has.
  if (chosen !== "" && !offered.includes(chosen) && order.paymentMethod !== chosen) return;
  const method = chosen === "" ? null : chosen;
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 120) || null;
  await prisma.order.update({ where: { id: orderId }, data: { paymentMethod: method, paymentReference: reference } });
  await audit(store.storeId, user.id, "ORDER_PAYMENT_METHOD_SET", orderId, { method, reference });
  revalidatePath(`/orders/${orderId}`);
}

export type FormState = { error?: string };

export async function duplicateOrderAction(orderId: string, _prev: FormState): Promise<FormState> {
  const { user, store } = await requireOrder(orderId);
  let newId: string;
  try {
    newId = (await duplicateOrder(store.storeId, user.id, orderId)).id;
  } catch (err) {
    if (err instanceof InsufficientAvailabilityError || err instanceof NoPriceTierError) {
      return { error: err.message };
    }
    logger.error({ err, orderId }, "duplicateOrderAction failed");
    return { error: "Could not duplicate the order." };
  }
  redirect(`/orders/${newId}`);
}

/** "Select start date": moves an Upcoming order, keeping its duration. `start` is an ISO instant. */
export async function rescheduleOrderAction(orderId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { user, store } = await requireOrder(orderId);
  const start = new Date(String(formData.get("start") ?? ""));
  if (Number.isNaN(start.getTime())) return { error: "Pick a valid start date." };

  if (formData.get("allowOutsideHours") !== "on") {
    const [row, order] = await Promise.all([
      prisma.store.findUniqueOrThrow({ where: { id: store.storeId }, select: { openingHours: true, holidays: true, timezone: true } }),
      prisma.order.findFirstOrThrow({ where: { id: orderId }, select: { startAt: true, endAt: true } }),
    ]);
    const parsed = openingHoursSchema.safeParse(row.openingHours);
    const hours = parsed.success ? parsed.data : null;
    const holidayParsed = holidaysSchema.safeParse(row.holidays);
    const days = holidayParsed.success ? holidayParsed.data : null;
    const end = new Date(order.endAt.getTime() + (start.getTime() - order.startAt.getTime()));
    if (!isWithinOpeningHours(hours, start, row.timezone, days) || !isWithinOpeningHours(hours, end, row.timezone, days)) {
      return { error: "The pickup or return time is outside the store opening hours. Tick the box to book anyway." };
    }
  }

  try {
    await rescheduleOrder(store.storeId, user.id, orderId, start);
  } catch (err) {
    if (err instanceof InsufficientAvailabilityError || err instanceof OrderNotEditableError) return { error: err.message };
    logger.error({ err, orderId }, "rescheduleOrderAction failed");
    return { error: "Could not reschedule the order." };
  }
  revalidatePath(`/orders/${orderId}`);
  return {};
}

export async function setReturnMethodAction(orderId: string, formData: FormData) {
  const { user, store } = await requireOrder(orderId);
  const method = formData.get("returnMethod") === "PICKUP" ? "PICKUP" : "STORE";
  await prisma.order.update({ where: { id: orderId }, data: { returnMethod: method } });
  await audit(store.storeId, user.id, "ORDER_RETURN_METHOD_SET", orderId, { method });
  revalidatePath(`/orders/${orderId}`);
}

/** The plus button next to the person chips: adds an existing customer, or a new one, to the order. */
export async function addPersonAction(orderId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { user, store, order } = await requireOrder(orderId);
  if (order.status === "COMPLETED" || order.status === "CANCELLED") return { error: "This order is closed." };

  const existingId = String(formData.get("customerId") ?? "");
  const nameRaw = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;

  let customer;
  if (existingId) {
    customer = await prisma.customer.findFirst({ where: { id: existingId, storeId: store.storeId } });
    if (!customer) return { error: "Customer not found." };
  } else {
    if (!nameRaw) return { error: "Enter a name or choose an existing customer." };
    customer = await prisma.customer.create({ data: { storeId: store.storeId, name: nameRaw, email, phone } });
  }

  await prisma.orderPerson.create({
    data: {
      orderId,
      customerId: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      isLiableCustomer: false,
    },
  });
  await audit(store.storeId, user.id, "PERSON_ADDED", orderId, { customerId: customer.id });
  revalidatePath(`/orders/${orderId}`);
  return {};
}

export async function removePersonAction(orderId: string, personId: string) {
  const { user, store } = await requireOrder(orderId);
  const [persons, itemCount] = await Promise.all([
    prisma.orderPerson.findMany({ where: { orderId } }),
    prisma.orderBooking.count({ where: { orderId, personId } }),
  ]);
  const person = persons.find((p) => p.id === personId);
  // A person who still holds items, or the only person on the order, can't be removed.
  if (!person || itemCount > 0 || persons.length <= 1) return;

  await prisma.$transaction(async (tx) => {
    await tx.orderPerson.delete({ where: { id: personId } });
    if (person.isLiableCustomer) {
      const next = persons.find((p) => p.id !== personId);
      if (next) await tx.orderPerson.update({ where: { id: next.id }, data: { isLiableCustomer: true } });
    }
  });
  await audit(store.storeId, user.id, "PERSON_REMOVED", orderId, { personId });
  revalidatePath(`/orders/${orderId}`);
}

export async function makeLiablePersonAction(orderId: string, personId: string) {
  const { user, store } = await requireOrder(orderId);
  await prisma.$transaction([
    prisma.orderPerson.updateMany({ where: { orderId }, data: { isLiableCustomer: false } }),
    prisma.orderPerson.updateMany({ where: { id: personId, orderId }, data: { isLiableCustomer: true } }),
  ]);
  await audit(store.storeId, user.id, "LIABLE_PERSON_SET", orderId, { personId });
  revalidatePath(`/orders/${orderId}`);
}

// ------------------------------------------------------------------ deposit

export type DepositState = { error?: string };

const money = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

/** Sets the amount of a deposit that has not been taken yet (creating one if the order has none). */
export async function setDepositAmountAction(orderId: string, _prev: DepositState, formData: FormData): Promise<DepositState> {
  const { user, store } = await requireOrder(orderId);
  const amount = money(formData.get("amount"));
  if (!Number.isFinite(amount) || amount < 0) return { error: "Enter a valid amount." };

  const existing = await prisma.orderDeposit.findUnique({ where: { orderId } });
  if (existing && existing.status !== "PENDING") return { error: "This deposit has already been taken." };
  if (amount === 0) {
    if (existing) await prisma.orderDeposit.delete({ where: { orderId } });
  } else if (existing) {
    await prisma.orderDeposit.update({ where: { orderId }, data: { amount } });
  } else {
    await prisma.orderDeposit.create({ data: { orderId, amount } });
  }
  await audit(store.storeId, user.id, "DEPOSIT_AMOUNT_SET", orderId, { amount });
  revalidatePath(`/orders/${orderId}`);
  return {};
}

/** The deposit has been taken from the customer (card hold, cash, ...). */
export async function holdDepositAction(orderId: string, formData: FormData) {
  const { user, store } = await requireOrder(orderId);
  const row = await prisma.store.findUniqueOrThrow({ where: { id: store.storeId }, select: { paymentMethodConfig: true } });
  const chosenName = String(formData.get("method") ?? "");
  const method = enabledPaymentLabels(resolvePaymentMethods(row.paymentMethodConfig)).includes(chosenName) ? chosenName : undefined;
  const result = await prisma.orderDeposit.updateMany({
    where: { orderId, status: "PENDING" },
    data: { status: "HELD", heldAt: new Date(), method: method ?? null },
  });
  if (result.count > 0) await audit(store.storeId, user.id, "DEPOSIT_HELD", orderId, { method });
  revalidatePath(`/orders/${orderId}`);
}

/** The deposit is given back in full. */
export async function releaseDepositAction(orderId: string) {
  const { user, store } = await requireOrder(orderId);
  const result = await prisma.orderDeposit.updateMany({
    where: { orderId, status: "HELD" },
    data: { status: "RELEASED", resolvedAt: new Date() },
  });
  if (result.count > 0) await audit(store.storeId, user.id, "DEPOSIT_RELEASED", orderId);
  revalidatePath(`/orders/${orderId}`);
}

/** Keeps some or all of a held deposit (damage, late fees); the rest is returned to the customer. */
export async function captureDepositAction(orderId: string, _prev: DepositState, formData: FormData): Promise<DepositState> {
  const { user, store } = await requireOrder(orderId);
  const deposit = await prisma.orderDeposit.findUnique({ where: { orderId } });
  if (!deposit || deposit.status !== "HELD") return { error: "Only a held deposit can be captured." };

  const amount = money(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim();
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount to keep." };
  if (amount > Number(deposit.amount)) return { error: "You can't keep more than the deposit." };
  if (!note) return { error: "Say what the deposit is being kept for." };

  await prisma.orderDeposit.update({
    where: { orderId },
    data: { status: "CAPTURED", capturedAmount: amount, note, resolvedAt: new Date() },
  });
  await audit(store.storeId, user.id, "DEPOSIT_CAPTURED", orderId, { amount, note });
  revalidatePath(`/orders/${orderId}`);
  return {};
}
