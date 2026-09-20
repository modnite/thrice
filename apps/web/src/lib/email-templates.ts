import { formatDateTime, formatMoney } from "./format";

type OrderForEmail = {
  orderNumber: number;
  startAt: Date;
  endAt: Date;
  totalPrice: unknown;
  currency: string;
  storeName: string;
  customerName: string;
  timeZone: string;
  bookings: { product: { name: string }; quantity: number }[];
};

export type EmailTemplate = { subject?: string | null; intro?: string | null; footer?: string | null };

export const DEFAULT_EMAIL_SUBJECT = "{{storeName}} - Order #{{orderNumber}} confirmation";
export const DEFAULT_EMAIL_INTRO = "Thank you for booking with {{storeName}}.";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

function fill(text: string, vars: Record<string, string>, escape: boolean) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key] ?? "";
    return escape ? escapeHtml(value) : value;
  });
}

/** Renders an order confirmation, using the store's own wording where it has set any. */
export function orderConfirmationEmail(order: OrderForEmail, template: EmailTemplate = {}): { subject: string; html: string } {
  const vars = {
    orderNumber: String(order.orderNumber),
    customer: order.customerName,
    storeName: order.storeName,
  };

  const items = order.bookings.map((b) => `<li>${b.quantity} &times; ${escapeHtml(b.product.name)}</li>`).join("");
  const intro = fill(template.intro?.trim() || DEFAULT_EMAIL_INTRO, vars, true).replace(/\n/g, "<br>");
  const footer = template.footer?.trim() ? fill(template.footer, vars, true).replace(/\n/g, "<br>") : "";

  return {
    subject: fill(template.subject?.trim() || DEFAULT_EMAIL_SUBJECT, vars, false),
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Order #${order.orderNumber}</h2>
        <p>${escapeHtml(formatDateTime(order.startAt, order.timeZone))} &ndash; ${escapeHtml(formatDateTime(order.endAt, order.timeZone))}</p>
        <ul>${items}</ul>
        <p><strong>Total: ${escapeHtml(formatMoney(String(order.totalPrice), order.currency))}</strong></p>
        <p>${intro}</p>
        ${footer ? `<p style="color:#666;font-size:12px">${footer}</p>` : ""}
      </div>
    `,
  };
}
