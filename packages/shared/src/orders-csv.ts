// Orders spreadsheet: one row per item, rows with the same order number form one order.
//
//   order number,status,customer,email,phone,start,end,product,variant,quantity,serial,price each,payment,payment method,prepared,notes
//   15495,upcoming,SGP Studios,,,19.09.2026 12:00,21.09.2026 12:00,OWC 480GB Atlas Pro CFexpress 4.0 Type A Memory Card,,4,,,paid,transfer,yes,
//
// Order-level columns (status, customer, dates, payment, notes...) are read from the first row of
// each order. Times are in the store's timezone.

import { parseCsvText } from "./rates-csv.js";
import { zonedDayStart } from "./zoned-date.js";

export type ImportStatus = "UPCOMING" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export type ImportPaymentMethod = string;

export type ImportItem = {
  line: number;
  product: string;
  variant: string;
  quantity: number;
  serials: string[];
  priceEach: number | null;
};

export type ImportOrder = {
  line: number;
  orderNumber: number;
  status: ImportStatus;
  customer: string;
  email: string | null;
  phone: string | null;
  startAt: Date;
  endAt: Date;
  endedAt: Date | null;
  createdAt: Date | null;
  paid: boolean;
  paymentMethod: ImportPaymentMethod | null;
  paymentReference: string | null;
  discountPercent: number | null;
  prepared: boolean;
  channel: "ADMIN" | "ONLINE";
  notes: string | null;
  items: ImportItem[];
};

export type OrdersCsvResult = { orders: ImportOrder[]; errors: { line: number; message: string }[] };

/** "19.09.2026 12:00", "19.09.2026, 02:18 PM", "2026-09-19 12:00" or ISO, read as store-local time. */
export function parseLocalDateTime(raw: string, timeZone: string): Date | null {
  const s = raw.trim().replace(/,/g, "");
  let y: number, mo: number, d: number, rest: string;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](.*))?$/);
  if (m) {
    [y, mo, d, rest] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ?? ""];
  } else if ((m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(.*))?$/))) {
    [d, mo, y, rest] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ?? ""];
  } else return null;

  let hours = 0;
  let minutes = 0;
  if (rest.trim()) {
    const t = rest.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(AM|PM|am|pm)?(?:Z)?$/);
    if (!t) return null;
    hours = Number(t[1]);
    minutes = Number(t[2]);
    const meridiem = t[3]?.toUpperCase();
    if (meridiem === "PM" && hours < 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hours > 23 || minutes > 59) return null;
  const iso = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dayStart = zonedDayStart(iso, timeZone);
  if (Number.isNaN(dayStart.getTime())) return null;
  return new Date(dayStart.getTime() + (hours * 60 + minutes) * 60_000);
}

const ALIASES: Record<string, string> = {
  "order number": "order", order: "order", number: "order", "order #": "order", "#": "order",
  status: "status",
  customer: "customer", name: "customer", "customer name": "customer",
  email: "email", phone: "phone",
  start: "start", "start date": "start", from: "start", "order start": "start",
  end: "end", "end date": "end", to: "end", return: "end", "return date": "end", "order end": "end",
  returned: "ended", ended: "ended", "actual end": "ended", "returned at": "ended",
  created: "created", "created at": "created",
  product: "product", variant: "variant",
  quantity: "quantity", qty: "quantity",
  serial: "serial", serials: "serial", id: "serial", "serial number": "serial",
  price: "price", "price each": "price", "item price": "price",
  payment: "payment", paid: "payment", "payment status": "payment",
  "payment method": "method", method: "method",
  "payment reference": "reference", reference: "reference", "transaction id": "reference", "receipt": "reference",
  discount: "discount", "discount %": "discount",
  prepared: "prepared", channel: "channel",
  notes: "notes", note: "notes", comment: "notes",
};

const yes = (v: string) => ["yes", "y", "true", "1", "paid", "prepared"].includes(v.trim().toLowerCase());

function parseStatus(v: string): ImportStatus | null {
  const s = v.trim().toLowerCase();
  if (s === "" || s === "upcoming" || s === "open" || s === "booked") return "UPCOMING";
  if (s === "active" || s === "in progress" || s === "started") return "ACTIVE";
  if (s === "completed" || s === "complete" || s === "done" || s === "returned" || s === "ended") return "COMPLETED";
  if (s === "cancelled" || s === "canceled") return "CANCELLED";
  return null;
}

/** The well-known names map to the default option names; anything else is kept as the store's own option name. */
function parseMethod(v: string): string | null {
  const s = v.trim();
  const l = s.toLowerCase();
  // "In-store" used to be a method of its own; card and cash are both in-store, so it means "not recorded".
  if (l === "" || ["in-store", "in store", "pay in-store", "store"].includes(l)) return null;
  if (["card", "debit/credit card", "debit", "credit"].includes(l)) return "Debit/Credit Card";
  if (l === "cash") return "Cash";
  if (["transfer", "online transfer", "bank transfer"].includes(l)) return "Online Transfer";
  return s.slice(0, 40);
}

function num(raw: string, decimalComma: boolean): number {
  let s = raw.trim().replace(/[\s ]/g, "").replace(/^TT\$/i, "");
  if (decimalComma && s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  return s === "" ? NaN : Number(s);
}

export function parseOrdersCsv(text: string, timeZone: string): OrdersCsvResult {
  const table = parseCsvText(text);
  const errors: OrdersCsvResult["errors"] = [];
  if (table.length === 0) return { orders: [], errors: [{ line: 1, message: "The file is empty." }] };

  const decimalComma = (text.split(/\r?\n/, 1)[0] ?? "").includes(";");
  const header = table[0].map((h) => ALIASES[h.trim().toLowerCase()] ?? "");
  const col = (n: string) => header.indexOf(n);
  for (const required of ["order", "customer", "start", "end", "product"]) {
    if (col(required) < 0) return { orders: [], errors: [{ line: 1, message: `Missing the "${required}" column.` }] };
  }

  const byNumber = new Map<number, ImportOrder & { bad: boolean }>();
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const get = (n: string) => (col(n) >= 0 ? (cells[col(n)] ?? "").trim() : "");
    const orderNumber = Number(get("order").replace(/^#/, ""));
    const fail = (message: string) => {
      errors.push({ line, message });
      const o = byNumber.get(orderNumber);
      if (o) o.bad = true;
    };
    if (!Number.isInteger(orderNumber) || orderNumber <= 0) return void errors.push({ line, message: `"${get("order")}" is not a valid order number.` });

    // ---- the item on this row
    const product = get("product");
    if (!product) return fail("Missing product.");
    const quantity = get("quantity") === "" ? 1 : Number(get("quantity"));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return fail(`"${get("quantity")}" is not a valid quantity.`);
    const serials = get("serial").split(/[;/|]/).map((x) => x.trim()).filter(Boolean);
    if (serials.length > 0 && serials.length !== quantity) return fail(`Quantity is ${quantity} but ${serials.length} serial number(s) were given.`);
    const priceEach = get("price") === "" ? null : num(get("price"), decimalComma);
    if (priceEach !== null && (!Number.isFinite(priceEach) || priceEach < 0)) return fail(`"${get("price")}" is not a valid price.`);
    const item: ImportItem = { line, product, variant: get("variant") || "Default", quantity, serials, priceEach };

    // ---- the order (first row wins; later rows must agree on anything they repeat)
    const existing = byNumber.get(orderNumber);
    if (existing) {
      const clash = (label: string, a: string, b: string) => (b !== "" && a !== b ? `${label} differs from the first row of order ${orderNumber}.` : null);
      const problem = clash("Customer", existing.customer, get("customer"));
      if (problem) return fail(problem);
      existing.items.push(item);
      return;
    }

    const status = parseStatus(get("status"));
    if (!status) return void errors.push({ line, message: `Unknown status "${get("status")}". Use upcoming, active, completed or cancelled.` });
    const startAt = parseLocalDateTime(get("start"), timeZone);
    const endAt = parseLocalDateTime(get("end"), timeZone);
    if (!startAt) return void errors.push({ line, message: `Can't read the start "${get("start")}". Use 19.09.2026 12:00 or 2026-09-19 12:00.` });
    if (!endAt) return void errors.push({ line, message: `Can't read the end "${get("end")}". Use 21.09.2026 12:00 or 2026-09-21 12:00.` });
    if (endAt <= startAt) return void errors.push({ line, message: "The end must be after the start." });
    if (!get("customer")) return void errors.push({ line, message: "Missing customer name." });

    let endedAt: Date | null = null;
    if (get("ended") !== "") {
      endedAt = parseLocalDateTime(get("ended"), timeZone);
      if (!endedAt) return void errors.push({ line, message: `Can't read the returned time "${get("ended")}".` });
    }
    let createdAt: Date | null = null;
    if (get("created") !== "") {
      createdAt = parseLocalDateTime(get("created"), timeZone);
      if (!createdAt) return void errors.push({ line, message: `Can't read the created time "${get("created")}".` });
    }
    const method = parseMethod(get("method"));
    const discount = get("discount") === "" ? null : num(get("discount").replace(/%$/, ""), decimalComma);
    if (discount !== null && (!Number.isFinite(discount) || discount < 0 || discount > 100)) return void errors.push({ line, message: `"${get("discount")}" is not a valid discount.` });

    byNumber.set(orderNumber, {
      line,
      orderNumber,
      status,
      customer: get("customer"),
      email: get("email") || null,
      phone: get("phone") || null,
      startAt,
      endAt,
      endedAt,
      createdAt,
      paid: yes(get("payment")),
      paymentMethod: method,
      paymentReference: get("reference") || null,
      discountPercent: discount,
      prepared: yes(get("prepared")),
      channel: get("channel").toLowerCase() === "online" ? "ONLINE" : "ADMIN",
      notes: get("notes") || null,
      items: [item],
      bad: false,
    });
  });

  const orders = [...byNumber.values()].filter((o) => !o.bad).map(({ bad: _bad, ...o }) => o);
  return { orders, errors };
}

export const ORDERS_TEMPLATE_CSV =
  [
    "order number,status,customer,email,phone,start,end,product,variant,quantity,serial,price each,payment,payment method,prepared,notes",
    "15495,upcoming,Example Studio,studio@example.com,868-555-0100,19.09.2026 12:00,21.09.2026 12:00,Example Camera Body,,1,SN12345,350,paid,transfer,yes,Collect at the front desk",
    "15495,,,,,,,Example Memory Card,,4,,,,,,",
    "15201,completed,Another Customer,,,10.09.2026 09:00,11.09.2026 09:00,Example Light,,2,LT001/LT002,100,paid,cash,,",
  ].join("\r\n") + "\r\n";
