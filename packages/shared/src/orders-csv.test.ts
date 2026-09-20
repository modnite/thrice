import { describe, expect, it } from "vitest";
import { ORDERS_TEMPLATE_CSV, parseLocalDateTime, parseOrdersCsv } from "./orders-csv.js";

const tz = "America/Port_of_Spain"; // UTC-4
const H = "order number,status,customer,email,phone,start,end,product,variant,quantity,serial,price each,payment,payment method,prepared,notes\n";

describe("parseLocalDateTime", () => {
  it("reads several formats as store-local time", () => {
    const expected = "2026-09-19T16:00:00.000Z"; // 12:00 local
    expect(parseLocalDateTime("19.09.2026 12:00", tz)?.toISOString()).toBe(expected);
    expect(parseLocalDateTime("2026-09-19 12:00", tz)?.toISOString()).toBe(expected);
    expect(parseLocalDateTime("2026-09-19T12:00", tz)?.toISOString()).toBe(expected);
    expect(parseLocalDateTime("19/09/2026 12:00", tz)?.toISOString()).toBe(expected);
  });
  it("reads TWICE-style 12 hour clocks", () => {
    expect(parseLocalDateTime("10.09.2026, 02:18 PM", tz)?.toISOString()).toBe("2026-09-10T18:18:00.000Z");
    expect(parseLocalDateTime("10.09.2026 12:05 AM", tz)?.toISOString()).toBe("2026-09-10T04:05:00.000Z");
  });
  it("rejects nonsense", () => {
    expect(parseLocalDateTime("yesterday", tz)).toBeNull();
    expect(parseLocalDateTime("32.01.2026 10:00", tz)).toBeNull();
    expect(parseLocalDateTime("19.09.2026 25:00", tz)).toBeNull();
  });
});

describe("parseOrdersCsv", () => {
  it("groups item rows into one order and reads order-level fields from the first row", () => {
    const r = parseOrdersCsv(
      H +
        "15495,upcoming,SGP Studios,,,19.09.2026 12:00,21.09.2026 12:00,Camera,,1,SN1,350,paid,transfer,yes,note\n" +
        "15495,,,,,,,Cards,,4,,,,,,\n",
      tz
    );
    expect(r.errors).toEqual([]);
    expect(r.orders).toHaveLength(1);
    const o = r.orders[0];
    expect(o).toMatchObject({ orderNumber: 15495, status: "UPCOMING", customer: "SGP Studios", paid: true, paymentMethod: "Online Transfer", prepared: true, notes: "note" });
    expect(o.items.map((i) => [i.product, i.quantity, i.serials, i.priceEach])).toEqual([
      ["Camera", 1, ["SN1"], 350],
      ["Cards", 4, [], null],
    ]);
  });

  it("splits several serials and checks they match the quantity", () => {
    const ok = parseOrdersCsv(H + "1,,A,,,19.09.2026 12:00,20.09.2026 12:00,Light,,2,L1/L2,,,,,\n", tz);
    expect(ok.orders[0].items[0].serials).toEqual(["L1", "L2"]);
    const bad = parseOrdersCsv(H + "2,,A,,,19.09.2026 12:00,20.09.2026 12:00,Light,,3,L1/L2,,,,,\n", tz);
    expect(bad.orders).toEqual([]);
    expect(bad.errors[0].message).toMatch(/3 but 2 serial/);
  });

  it("drops an order with any bad row and reports the line", () => {
    const r = parseOrdersCsv(H + "1,,A,,,19.09.2026 12:00,20.09.2026 12:00,Light,,1,,abc,,,,\n2,,B,,,19.09.2026 12:00,20.09.2026 12:00,Light,,1,,,,,,\n", tz);
    expect(r.orders.map((o) => o.orderNumber)).toEqual([2]);
    expect(r.errors[0]).toMatchObject({ line: 2 });
  });

  it("validates dates, status and customer", () => {
    expect(parseOrdersCsv(H + "1,,A,,,20.09.2026 12:00,19.09.2026 12:00,X,,1,,,,,,\n", tz).errors[0].message).toMatch(/after the start/);
    expect(parseOrdersCsv(H + "1,weird,A,,,19.09.2026 12:00,20.09.2026 12:00,X,,1,,,,,,\n", tz).errors[0].message).toMatch(/Unknown status/);
    expect(parseOrdersCsv(H + "1,,,,,19.09.2026 12:00,20.09.2026 12:00,X,,1,,,,,,\n", tz).errors[0].message).toMatch(/customer/i);
  });

  it("flags a later row that names a different customer", () => {
    const r = parseOrdersCsv(H + "1,,A,,,19.09.2026 12:00,20.09.2026 12:00,X,,1,,,,,,\n1,,B,,,,,Y,,1,,,,,,\n", tz);
    expect(r.orders).toEqual([]);
    expect(r.errors[0].message).toMatch(/Customer differs/);
  });

  it("treats the old in-store method as no method, and reads a payment reference", () => {
    const r = parseOrdersCsv(
      "order number,customer,start,end,product,payment method,payment reference\n1,A,19.09.2026 12:00,20.09.2026 12:00,X,Pay in-store,\n2,B,19.09.2026 12:00,20.09.2026 12:00,X,card,WP-12345\n",
      tz
    );
    expect(r.errors).toEqual([]);
    expect(r.orders.map((o) => [o.paymentMethod, o.paymentReference])).toEqual([[null, null], ["Debit/Credit Card", "WP-12345"]]);
  });

  it("requires the key columns", () => {
    expect(parseOrdersCsv("a,b\n1,2", tz).errors[0].message).toMatch(/Missing the "order"/);
  });

  it("the downloadable template parses cleanly", () => {
    const r = parseOrdersCsv(ORDERS_TEMPLATE_CSV, tz);
    expect(r.errors).toEqual([]);
    expect(r.orders.map((o) => o.orderNumber)).toEqual([15495, 15201]);
    expect(r.orders[0].items).toHaveLength(2);
    expect(r.orders[1].status).toBe("COMPLETED");
  });
});
