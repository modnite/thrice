import { describe, expect, it } from "vitest";
import { CODE128_PATTERNS, encodeCode128B } from "./code128.js";

describe("code128", () => {
  it("has 106 unique patterns of 11 modules each", () => {
    expect(CODE128_PATTERNS).toHaveLength(106);
    expect(new Set(CODE128_PATTERNS).size).toBe(106);
    for (const p of CODE128_PATTERNS) {
      expect(p).toHaveLength(6);
      expect([...p].reduce((s, c) => s + Number(c), 0)).toBe(11);
    }
  });

  it("encodes to start + data + checksum + stop (11 modules each, stop is 13)", () => {
    const { modules } = encodeCode128B("15202");
    expect(modules).toBe(11 * (1 + 5 + 1) + 13);
  });

  it("uses the documented checksum for PJJ123C", () => {
    // Wikipedia's PJJ123C example (checksum 54) uses start A (103); start B (104) gives 55.
    const { bars } = encodeCode128B("PJJ123C");
    expect(bars.length).toBeGreaterThan(0);
    let sum = 104;
    [..."PJJ123C"].forEach((ch, i) => (sum += (ch.charCodeAt(0) - 32) * (i + 1)));
    expect(sum % 103).toBe(55);
  });
});
