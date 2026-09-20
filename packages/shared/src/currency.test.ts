import { describe, expect, it } from "vitest";
import { currencySymbol, formatMoney } from "./currency";

describe("currency", () => {
  it("uses short symbols where they exist", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("ttd")).toBe("TT$");
    expect(formatMoney(12.5, "EUR")).toBe("€12.50");
    expect(formatMoney("7", "TTD")).toBe("TT$7.00");
  });
  it("falls back to the code, and to USD when none is given", () => {
    expect(formatMoney(3, "CHF")).toBe("CHF 3.00");
    expect(formatMoney(3)).toBe("$3.00");
    expect(currencySymbol(null)).toBe("$");
  });
});
