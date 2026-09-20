const LABELS: Record<string, string> = {
  ORDER_CREATED: "Order created",
  ORDER_STARTED: "Order started",
  ORDER_ENDED: "Order ended",
  PERSON_ENDED: "A person's items were returned",
  ORDER_START_CANCELLED: "Start cancelled (back to upcoming)",
  ORDER_REOPENED: "Order re-opened",
  ORDER_CANCELLED: "Order cancelled",
  ORDER_RESCHEDULED: "Order rescheduled",
  ORDER_DUPLICATED: "Order duplicated",
  ORDER_PREPARED: "Marked as prepared",
  ORDER_UNPREPARED: "Marked as not prepared",
  ORDER_MARKED_PAID: "Marked as paid",
  ORDER_MARKED_UNPAID: "Marked as unpaid",
  ORDER_PAYMENT_METHOD_SET: "Payment method changed",
  ORDER_RETURN_METHOD_SET: "Return method changed",
  ORDER_DISCOUNT_SET: "Discount changed",
  ORDER_NOTES_UPDATED: "Comment updated",
  BOOKING_PRICE_UPDATED: "Item price changed",
  BOOKING_NOTES_UPDATED: "Item note updated",
  BOOKING_UNIT_REMOVED: "Item removed",
  PRODUCT_ADDED: "Product added",
  ARTICLE_REASSIGNED: "Serial changed",
  CONFIRMATION_EMAIL_SENT: "Confirmation email sent",
  PERSON_ADDED: "Person added",
  PERSON_REMOVED: "Person removed",
  LIABLE_PERSON_SET: "Liable customer changed",
};

/** Human-readable text for an audit-log action code, with the most useful detail from its diff. */
export function describeAuditAction(action: string, diff: unknown): string {
  const base =
    LABELS[action] ??
    action
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/^./, (c) => c.toUpperCase());
  const d = (diff ?? {}) as Record<string, unknown>;
  if (action === "BOOKING_PRICE_UPDATED" && typeof d.priceEach === "number") return `${base} to ${d.priceEach.toFixed(2)}`;
  if (action === "ORDER_DISCOUNT_SET") return d.discountPercent ? `${base} to ${d.discountPercent}%` : `${base} (removed)`;
  return base;
}
