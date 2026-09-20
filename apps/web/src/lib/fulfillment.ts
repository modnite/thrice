export type Fulfillment = "Unfulfilled" | "Fulfilled" | "Partially returned" | "Returned";

/**
 * TWICE tracks fulfillment separately from an order's status. Ours is derived from what staff
 * have actually done: nothing is handed over until the order is started, and items come back
 * person by person as each one's "End order" switch is used.
 */
export function fulfillmentOf(
  status: "UPCOMING" | "ACTIVE" | "COMPLETED" | "CANCELLED",
  owners: { endedAt: Date | null }[]
): Fulfillment {
  if (status === "UPCOMING" || status === "CANCELLED") return "Unfulfilled";
  if (status === "COMPLETED") return "Returned";
  const returned = owners.filter((o) => o.endedAt).length;
  return returned > 0 && returned < owners.length ? "Partially returned" : "Fulfilled";
}
