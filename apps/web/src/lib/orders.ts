import { prisma, type Prisma } from "@thrice/db";
import { holidaysSchema, isWithinOpeningHours, openingHoursSchema, type CreateOrderInput } from "@thrice/shared";
import { getVariantAvailability, isArticleFreeForWindow, pickSkusForSlot } from "./availability";
import { syncDeposit } from "./deposits";
import { quoteVariantPrice } from "./pricing";

type Tx = Prisma.TransactionClient;

export class InsufficientAvailabilityError extends Error {
  constructor(public variantName: string, public requested: number, public available: number) {
    super(`Not enough availability for "${variantName}": requested ${requested}, ${available} available`);
  }
}

export class OutsideOpeningHoursError extends Error {
  constructor(public which: "pickup" | "return") {
    super(`The ${which} time is outside the store opening hours.`);
  }
}

export class SerialUnavailableError extends Error {
  constructor(public articleCode: string, reason: string) {
    super(`${articleCode} ${reason}`);
  }
}

export class NoPriceTierError extends Error {
  constructor(public variantName: string) {
    super(`"${variantName}" has no price set for this duration.`);
  }
}

/**
 * Creates one OrderBooking (+ its OrderLine fulfillment rows) inside an
 * existing transaction. Shared by createOrder (new orders) and
 * addBookingToOrder (adding a product to an order that already exists) so
 * the availability check, price resolution and slot fulfillment can't drift
 * between the two call sites.
 */
export async function createBookingLine(
  tx: Tx,
  storeId: string,
  orderId: string,
  args: {
    variantId: string;
    quantity: number;
    from: Date;
    to: Date;
    personId?: string;
    priceOverride?: number;
    lineStartAt?: Date;
    lineEndAt?: Date;
    /** Specific stock items to book (single-resource variants only); one per unit. */
    articleIds?: string[];
  }
) {
  const variant = await tx.productVariant.findFirstOrThrow({
    where: { id: args.variantId, storeId },
    include: { slots: true },
  });

  const availability = await getVariantAvailability(storeId, args.variantId, args.from, args.to, tx);
  if (availability.available < args.quantity) {
    throw new InsufficientAvailabilityError(variant.name, args.quantity, availability.available);
  }

  let priceEach: number;
  if (args.priceOverride !== undefined) {
    priceEach = args.priceOverride;
  } else {
    const quote = await quoteVariantPrice(args.variantId, args.from, args.to, tx);
    if (!quote) throw new NoPriceTierError(variant.name);
    priceEach = quote.total;
  }

  const booking = await tx.orderBooking.create({
    data: {
      orderId,
      personId: args.personId,
      productId: variant.productId,
      variantId: variant.id,
      quantity: args.quantity,
      priceEach,
      startAt: args.lineStartAt ?? undefined,
      endAt: args.lineEndAt ?? undefined,
    },
  });

  if (args.articleIds && args.articleIds.length > 0) {
    if (variant.slots.length !== 1) throw new SerialUnavailableError("Serial numbers", "can only be pinned on products with a single resource.");
    if (args.articleIds.length !== args.quantity) throw new SerialUnavailableError("Serial numbers", "must match the quantity.");
    const slot = variant.slots[0];
    const options = await tx.variantSlotSkuOption.findMany({ where: { slotId: slot.id }, select: { skuId: true } });
    const allowedSkus = new Set(options.map((o) => o.skuId));
    for (const articleId of args.articleIds) {
      // Lock the unit so nothing else books it while we check and assign it.
      await tx.$queryRaw`SELECT id FROM articles WHERE id = ${articleId} FOR UPDATE`;
      const article = await tx.article.findFirst({ where: { id: articleId, storeId } });
      if (!article) throw new SerialUnavailableError(articleId, "does not exist.");
      if (article.status !== "IN_USE") throw new SerialUnavailableError(article.articleCode, "is marked lost or out of use.");
      if (!allowedSkus.has(article.skuId)) throw new SerialUnavailableError(article.articleCode, `is not stock for "${variant.name === "Default" ? "this product" : variant.name}".`);
      if (!(await isArticleFreeForWindow(storeId, articleId, args.from, args.to, "", tx))) {
        throw new SerialUnavailableError(article.articleCode, "is already booked for those dates.");
      }
      await tx.orderLine.create({
        data: { bookingId: booking.id, slotId: slot.id, skuId: article.skuId, articleId, quantity: 1 },
      });
    }
    return { booking, priceEach };
  }

  for (const slot of variant.slots) {
    const picks = await pickSkusForSlot(tx, storeId, slot.id, args.from, args.to, args.quantity);
    for (const pick of picks) {
      await tx.orderLine.create({
        data: {
          bookingId: booking.id,
          slotId: slot.id,
          skuId: pick.skuId,
          articleId: pick.articleId,
          quantity: pick.quantity,
        },
      });
    }
  }

  return { booking, priceEach };
}

/** Serializes order-number allocation per store (advisory lock held until the transaction ends). */
async function nextOrderNumber(tx: Tx, storeId: string): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${storeId}))`;
  const maxRow = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT MAX("orderNumber") as max FROM orders WHERE "storeId" = ${storeId}
  `;
  // A new store starts at 1001; imported orders keep their own numbers and numbering continues after the highest.
  return (maxRow[0]?.max ?? 1000) + 1;
}

export function applyDiscount(baseTotal: number, discountPercent: number | null) {
  if (!discountPercent) return baseTotal;
  return baseTotal * (1 - discountPercent / 100);
}

export async function createOrder(storeId: string, userId: string, rawInput: CreateOrderInput) {
  let input = rawInput;
  if (input.bookNow) {
    // BOOK NOW starts the rental at the moment of submission, keeping the chosen duration.
    const now = new Date();
    input = { ...input, startAt: now, endAt: new Date(now.getTime() + (rawInput.endAt.getTime() - rawInput.startAt.getTime())) };
  }

  if (!input.allowOutsideHours) {
    const store = await prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { openingHours: true, holidays: true, timezone: true },
    });
    const parsed = openingHoursSchema.safeParse(store.openingHours);
    const hours = parsed.success ? parsed.data : null;
    const holidays = holidaysSchema.safeParse(store.holidays);
    const days = holidays.success ? holidays.data : null;
    if (!isWithinOpeningHours(hours, input.startAt, store.timezone, days)) throw new OutsideOpeningHoursError("pickup");
    if (!isWithinOpeningHours(hours, input.endAt, store.timezone, days)) throw new OutsideOpeningHoursError("return");
  }

  return prisma.$transaction(async (tx) => {
    const orderNumber = await nextOrderNumber(tx, storeId);

    // BOOK NOW starts immediately; RESERVE stays Upcoming until staff press Start.
    const status = input.bookNow ? "ACTIVE" : "UPCOMING";

    const order = await tx.order.create({
      data: {
        storeId,
        orderNumber,
        status,
        deliveryRequired: input.deliveryRequired,
        returnMethod: input.returnMethod,
        startedAt: input.bookNow ? input.startAt : null,
        channel: input.channel,
        notes: input.notes ?? undefined,
        startAt: input.startAt,
        endAt: input.endAt,
        totalPrice: 0,
      },
    });

    // Resolve each person: reuse an existing Customer if customerId was
    // given, otherwise create one from the provided name/contact details.
    const personIdByIndex: string[] = [];
    let liableAssigned = false;
    let liablePersonId: string | undefined;

    for (let i = 0; i < input.persons.length; i++) {
      const p = input.persons[i];
      let customerId = p.customerId;
      let personName = p.name;
      let personEmail = p.email;
      let personPhone = p.phone;
      if (customerId) {
        // Use the customer's own record, so their email reaches the order (confirmations) even when the form left it blank.
        const known = await tx.customer.findFirst({ where: { id: customerId, storeId } });
        if (!known) throw new Error("Customer not found.");
        personName = known.name;
        personEmail = p.email ?? known.email ?? undefined;
        personPhone = p.phone ?? known.phone ?? undefined;
      }
      if (!customerId && p.email) {
        // A repeat booker (typically from the website) keeps one customer record, matched by email.
        const existing = await tx.customer.findFirst({ where: { storeId, email: { equals: p.email.trim(), mode: "insensitive" } }, select: { id: true, phone: true } });
        if (existing) {
          customerId = existing.id;
          if (!existing.phone && p.phone) await tx.customer.update({ where: { id: existing.id }, data: { phone: p.phone } });
        }
      }
      if (!customerId) {
        const customer = await tx.customer.create({
          data: { storeId, name: p.name, email: p.email, phone: p.phone },
        });
        customerId = customer.id;
      }

      const isLiableCustomer = p.isLiableCustomer ?? (!liableAssigned && i === 0);
      if (isLiableCustomer) liableAssigned = true;

      const person = await tx.orderPerson.create({
        data: {
          orderId: order.id,
          customerId,
          name: personName,
          email: personEmail,
          phone: personPhone,
          isLiableCustomer,
        },
      });
      personIdByIndex.push(person.id);
      if (isLiableCustomer && !liablePersonId) liablePersonId = person.id;
    }

    let totalPrice = 0;

    for (const line of input.lines) {
      const lineFrom = line.startAt ?? input.startAt;
      const lineTo = line.endAt ?? input.endAt;
      const personId = line.personIndex !== undefined ? personIdByIndex[line.personIndex] : liablePersonId;

      const { priceEach } = await createBookingLine(tx, storeId, order.id, {
        variantId: line.variantId,
        quantity: line.quantity,
        from: lineFrom,
        to: lineTo,
        personId,
        lineStartAt: line.startAt,
        lineEndAt: line.endAt,
      });

      totalPrice += line.quantity * priceEach;
    }

    await syncDeposit(tx, order.id);

    const finalOrder = await tx.order.update({
      where: { id: order.id },
      data: { totalPrice },
      include: { bookings: { include: { product: true, lines: true } }, persons: true },
    });

    await tx.auditLog.create({
      data: {
        storeId,
        userId,
        action: "ORDER_CREATED",
        entityType: "Order",
        entityId: order.id,
        diff: { orderNumber, totalPrice, bookingCount: input.lines.length, personCount: input.persons.length },
      },
    });

    return finalOrder;
  });
}

/**
 * Adds one more product booking to an order that already exists (staff
 * clicking "Add product" on the order detail page). Uses the order's own
 * window unless overridden, re-derives totalPrice from all bookings
 * (existing + new) with the order's discount reapplied.
 */
export async function addBookingToOrder(
  storeId: string,
  userId: string,
  orderId: string,
  args: { variantId: string; quantity: number; personId?: string; priceOverride?: number }
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirstOrThrow({ where: { id: orderId, storeId } });

    // Items always belong to a person; default to the liable customer.
    let personId = args.personId;
    if (personId) {
      await tx.orderPerson.findFirstOrThrow({ where: { id: personId, orderId }, select: { id: true } });
    } else {
      const persons = await tx.orderPerson.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
      personId = (persons.find((p) => p.isLiableCustomer) ?? persons[0])?.id;
    }

    await createBookingLine(tx, storeId, orderId, {
      variantId: args.variantId,
      quantity: args.quantity,
      from: order.startAt,
      to: order.endAt,
      personId,
      priceOverride: args.priceOverride,
    });
    await syncDeposit(tx, orderId);

    const bookings = await tx.orderBooking.findMany({ where: { orderId } });
    const baseTotal = bookings.reduce((sum, b) => sum + b.quantity * Number(b.priceEach), 0);
    const totalPrice = applyDiscount(baseTotal, order.discountPercent ? Number(order.discountPercent) : null);

    const updated = await tx.order.update({
      where: { id: orderId },
      data: { totalPrice },
      include: { bookings: { include: { product: true, variant: true, lines: true } }, persons: true },
    });

    await tx.auditLog.create({
      data: {
        storeId,
        userId,
        action: "ORDER_BOOKING_ADDED",
        entityType: "Order",
        entityId: orderId,
        diff: { variantId: args.variantId, quantity: args.quantity },
      },
    });

    return updated;
  });
}

export class OrderNotEditableError extends Error {}

/**
 * Moves an Upcoming order to a new start date, keeping its duration. Every fulfillment row is
 * released and re-picked for the new window, so availability is re-checked for each booking;
 * if anything can't be fulfilled the whole change rolls back.
 */
export async function rescheduleOrder(storeId: string, userId: string, orderId: string, newStart: Date) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirstOrThrow({
      where: { id: orderId, storeId },
      include: { bookings: { include: { variant: { include: { slots: true } } } } },
    });
    if (order.status !== "UPCOMING") throw new OrderNotEditableError("Only upcoming orders can be rescheduled.");

    const delta = newStart.getTime() - order.startAt.getTime();
    const newEnd = new Date(order.endAt.getTime() + delta);
    const shift = (d: Date | null) => (d ? new Date(d.getTime() + delta) : null);

    await tx.orderLine.deleteMany({ where: { booking: { orderId } } });
    await tx.order.update({ where: { id: orderId }, data: { startAt: newStart, endAt: newEnd } });
    for (const b of order.bookings) {
      await tx.orderBooking.update({ where: { id: b.id }, data: { startAt: shift(b.startAt), endAt: shift(b.endAt) } });
    }

    for (const b of order.bookings) {
      const from = shift(b.startAt) ?? newStart;
      const to = shift(b.endAt) ?? newEnd;
      const availability = await getVariantAvailability(storeId, b.variantId, from, to, tx);
      if (availability.available < b.quantity) {
        throw new InsufficientAvailabilityError(b.variant.name, b.quantity, availability.available);
      }
      for (const slot of b.variant.slots) {
        const picks = await pickSkusForSlot(tx, storeId, slot.id, from, to, b.quantity);
        for (const pick of picks) {
          await tx.orderLine.create({
            data: { bookingId: b.id, slotId: slot.id, skuId: pick.skuId, articleId: pick.articleId, quantity: pick.quantity },
          });
        }
      }
    }

    await tx.auditLog.create({
      data: {
        storeId,
        userId,
        action: "ORDER_RESCHEDULED",
        entityType: "Order",
        entityId: orderId,
        diff: { from: order.startAt, to: newStart },
      },
    });
    return { startAt: newStart, endAt: newEnd };
  });
}

/**
 * Copies an order (people, products, prices, discount) into a new Upcoming order starting at
 * the next quarter hour with the same duration. Availability is checked like any new booking.
 */
export async function duplicateOrder(storeId: string, userId: string, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.order.findFirstOrThrow({
      where: { id: orderId, storeId },
      include: { persons: true, bookings: true },
    });

    const quarter = 15 * 60_000;
    const startAt = new Date(Math.ceil(Date.now() / quarter) * quarter);
    const delta = startAt.getTime() - source.startAt.getTime();
    const endAt = new Date(source.endAt.getTime() + delta);
    const shift = (d: Date | null) => (d ? new Date(d.getTime() + delta) : undefined);

    const orderNumber = await nextOrderNumber(tx, storeId);
    const order = await tx.order.create({
      data: {
        storeId,
        orderNumber,
        status: "UPCOMING",
        type: source.type,
        deliveryRequired: source.deliveryRequired,
        returnMethod: source.returnMethod,
        paymentMethod: source.paymentMethod,
        discountPercent: source.discountPercent,
        channel: "ADMIN",
        startAt,
        endAt,
        totalPrice: 0,
      },
    });

    const personIdMap = new Map<string, string>();
    for (const p of source.persons) {
      const created = await tx.orderPerson.create({
        data: {
          orderId: order.id,
          customerId: p.customerId,
          name: p.name,
          email: p.email,
          phone: p.phone,
          isLiableCustomer: p.isLiableCustomer,
        },
      });
      personIdMap.set(p.id, created.id);
    }

    let baseTotal = 0;
    for (const b of source.bookings) {
      const lineStart = shift(b.startAt);
      const lineEnd = shift(b.endAt);
      const { priceEach } = await createBookingLine(tx, storeId, order.id, {
        variantId: b.variantId,
        quantity: b.quantity,
        from: lineStart ?? startAt,
        to: lineEnd ?? endAt,
        personId: b.personId ? personIdMap.get(b.personId) : undefined,
        priceOverride: Number(b.priceEach),
        lineStartAt: lineStart,
        lineEndAt: lineEnd,
      });
      baseTotal += b.quantity * priceEach;
    }

    const totalPrice = applyDiscount(baseTotal, source.discountPercent ? Number(source.discountPercent) : null);
    await tx.order.update({ where: { id: order.id }, data: { totalPrice } });
    await syncDeposit(tx, order.id);
    await tx.auditLog.create({
      data: {
        storeId,
        userId,
        action: "ORDER_DUPLICATED",
        entityType: "Order",
        entityId: order.id,
        diff: { sourceOrderId: source.id, orderNumber },
      },
    });
    return { id: order.id, orderNumber };
  });
}
