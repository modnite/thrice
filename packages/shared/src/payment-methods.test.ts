import { describe, expect, it } from "vitest";
import { DEFAULT_PAYMENT_METHODS, enabledPaymentLabels, paymentMethodsInputSchema, resolvePaymentMethods } from "./payment-methods.js";

describe("resolvePaymentMethods", () => {
  it("offers card, cash and transfer (and no in-store) until the store customises", () => {
    expect(resolvePaymentMethods(null).map((m) => m.label)).toEqual(["Debit/Credit Card", "Cash", "Online Transfer"]);
  });

  it("reads the older fixed-key format, dropping the removed in-store entry", () => {
    const saved = {
      IN_STORE: { enabled: true, description: "old" },
      CARD: { enabled: false, description: "Terminal is broken" },
      TRANSFER: { enabled: true, description: "Bank: Test, Acct 123" },
    };
    const list = resolvePaymentMethods(saved);
    expect(list.map((m) => m.id)).toEqual(["card", "cash", "transfer"]);
    expect(list[0]).toMatchObject({ enabled: false, description: "Terminal is broken" });
    expect(list[1]).toEqual(DEFAULT_PAYMENT_METHODS[1]);
    expect(list[2].description).toBe("Bank: Test, Acct 123");
  });

  it("returns a saved list as is, including a custom option", () => {
    const saved = [
      { id: "wipay", label: "WiPay", description: "Paid online", enabled: true },
      { id: "cash", label: "Cash", description: "", enabled: false },
    ];
    expect(resolvePaymentMethods(saved)).toEqual(saved);
  });

  it("respects a store that deliberately has no options", () => {
    expect(resolvePaymentMethods([])).toEqual([]);
  });

  it("skips a malformed entry instead of discarding the list", () => {
    const list = resolvePaymentMethods([{ id: "cash", label: "Cash", description: "", enabled: true }, { nonsense: true }]);
    expect(list.map((m) => m.label)).toEqual(["Cash"]);
  });
});

describe("paymentMethodsInputSchema", () => {
  const ok = { id: "a", label: "WiPay", description: "", enabled: true };

  it("accepts a valid list", () => {
    expect(paymentMethodsInputSchema.safeParse([ok]).success).toBe(true);
  });

  it("rejects empty names, duplicate names (any case) and too many options", () => {
    expect(paymentMethodsInputSchema.safeParse([{ ...ok, label: "  " }]).success).toBe(false);
    expect(paymentMethodsInputSchema.safeParse([ok, { ...ok, id: "b", label: "wipay" }]).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => ({ ...ok, id: `i${i}`, label: `Option ${i}` }));
    expect(paymentMethodsInputSchema.safeParse(many).success).toBe(false);
  });
});

describe("enabledPaymentLabels", () => {
  it("lists only shown options, in order", () => {
    expect(
      enabledPaymentLabels([
        { id: "1", label: "A", description: "", enabled: true },
        { id: "2", label: "B", description: "", enabled: false },
        { id: "3", label: "C", description: "", enabled: true },
      ])
    ).toEqual(["A", "C"]);
  });
});
