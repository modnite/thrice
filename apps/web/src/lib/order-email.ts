import "server-only";
import { prisma } from "@thrice/db";
import { logger } from "./logger";
import { orderConfirmationEmail } from "./email-templates";
import { EmailNotConfiguredError, sendEmail } from "./mailer";

export type EmailResult = { ok: true; to: string } | { ok: false; reason: string };

/**
 * Emails the order confirmation to the liable customer, in the store's own wording.
 * Returns a reason instead of throwing so callers can show staff exactly what went wrong.
 */
export async function sendOrderConfirmation(storeId: string, orderId: string): Promise<EmailResult> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId },
    include: { store: true, persons: true, bookings: { include: { product: true } } },
  });
  if (!order) return { ok: false, reason: "Order not found." };

  const liable = order.persons.find((p) => p.isLiableCustomer) ?? order.persons[0];
  if (!liable?.email) return { ok: false, reason: "The liable customer has no email address on file." };

  const { subject, html } = orderConfirmationEmail(
    {
      orderNumber: order.orderNumber,
      startAt: order.startAt,
      endAt: order.endAt,
      totalPrice: order.totalPrice,
      currency: order.currency,
      storeName: order.store.name,
      customerName: liable.name,
      timeZone: order.store.timezone,
      bookings: order.bookings,
    },
    { subject: order.store.emailSubject, intro: order.store.emailIntro, footer: order.store.emailFooter }
  );

  try {
    await sendEmail(storeId, liable.email, subject, html);
  } catch (err) {
    if (err instanceof EmailNotConfiguredError) return { ok: false, reason: err.message };
    logger.warn({ err, orderId }, "sendOrderConfirmation: send failed");
    return { ok: false, reason: "The email could not be sent. Check the SMTP settings and try again." };
  }
  await prisma.auditLog.create({
    data: { storeId, action: "CONFIRMATION_EMAIL_SENT", entityType: "Order", entityId: orderId, diff: { to: liable.email } },
  });
  return { ok: true, to: liable.email };
}
