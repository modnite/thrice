import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@thrice/db";
import { runFullImport } from "@thrice/importer";
import { zonedDayStart, zonedToday } from "@thrice/shared";
import { createOrder } from "./orders";
import { replaceVariantRates, type RateInput } from "./rates";

/**
 * Sample data so a new install has something to look at: a small outdoor-gear catalog with rates, stock, customers
 * and orders in every state. The catalog comes from the same made-up TWICE-format CSV files the importer tests use.
 * Nothing here is real. Load it into an empty store only.
 */

const FIXTURE_DIRS = [
  path.join(process.cwd(), "packages", "importer", "__fixtures__"),
  path.join(process.cwd(), "..", "..", "packages", "importer", "__fixtures__"),
  path.join(process.cwd(), "..", "packages", "importer", "__fixtures__"),
];

function readFixture(name: string): { fileName: string; content: string } {
  for (const dir of FIXTURE_DIRS) {
    const file = path.join(dir, name);
    if (existsSync(file)) return { fileName: name, content: readFileSync(file, "utf-8") };
  }
  throw new Error(`Sample data file ${name} was not found in this build.`);
}

const hour = (price: number): RateInput => ({ durationMinutes: 60, price, additionalPrice: price });
const day = (price: number): RateInput => ({ durationMinutes: 1440, price, additionalPrice: price });
const flat = (price: number): RateInput => ({ durationMinutes: null, price, additionalPrice: null });

/** Product name -> rates. Anything not listed falls back to its "price from" as a flat rate. */
const RATES: Record<string, RateInput[]> = {
  "City Bike": [hour(4), day(12)],
  "Mountain Bike": [hour(7), day(20)],
  "Kids Bike": [hour(3), day(8)],
  "4-Person Tent": [day(25)],
  "Sleeping Bag": [day(6)],
  "Camp Stove": [day(9)],
  "Single Kayak": [hour(12), day(30)],
  "Paddle Board": [hour(14), day(35)],
  "Mirrorless Camera Kit": [hour(20), day(60)],
  "Carbon Tripod": [day(10)],
  "Delivery within 10 km": [flat(15)],
  "Late Return Fee": [flat(10)],
};

export async function storeIsEmpty(storeId: string): Promise<boolean> {
  const [products, orders, customers, skus] = await Promise.all([
    prisma.product.count({ where: { storeId } }),
    prisma.order.count({ where: { storeId } }),
    prisma.customer.count({ where: { storeId } }),
    prisma.sku.count({ where: { storeId } }),
  ]);
  return products + orders + customers + skus === 0;
}

export async function loadDemoData(storeId: string, actorUserId: string): Promise<void> {
  if (!(await storeIsEmpty(storeId))) throw new Error("Sample data can only be loaded into an empty store.");

  await runFullImport(storeId, {
    categoriesCsv: readFixture("categories.csv"),
    productsCsv: readFixture("products.csv"),
    skusCsv: readFixture("skus.csv"),
    articlesCsv: readFixture("articles.csv"),
  });

  const variants = await prisma.productVariant.findMany({
    where: { storeId },
    select: { id: true, productId: true, product: { select: { name: true, priceFrom: true } } },
  });
  const variantByProduct = new Map(variants.map((v) => [v.product.name, v.id]));

  for (const v of variants) {
    const rates = RATES[v.product.name] ?? [flat(Number(v.product.priceFrom))];
    await prisma.$transaction((tx) => replaceVariantRates(tx, storeId, { id: v.id, productId: v.productId }, "ELAPSED", rates));
  }

  const variant = (name: string) => {
    const id = variantByProduct.get(name);
    if (!id) throw new Error(`Sample product "${name}" is missing.`);
    return id;
  };

  // Times are "N days from today at H o'clock" in the store's own time zone, so they read naturally on screen.
  const { timezone } = await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { timezone: true } });
  const at = (days: number, hours: number) => {
    const day = new Date(`${zonedToday(timezone)}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + days);
    return new Date(zonedDayStart(day.toISOString().slice(0, 10), timezone).getTime() + hours * 3_600_000);
  };

  type Sample = {
    who: { name: string; email: string; phone: string };
    start: Date;
    end: Date;
    bookNow?: boolean;
    finished?: boolean;
    notes?: string;
    lines: [string, number][];
  };
  const samples: Sample[] = [
    { who: { name: "Amara Brooks", email: "amara.brooks@example.com", phone: "555-0101" }, start: at(1, 9), end: at(1, 17), lines: [["City Bike", 2], ["Carbon Tripod", 1]] },
    { who: { name: "Diego Martins", email: "diego.martins@example.com", phone: "555-0102" }, start: at(3, 9), end: at(5, 17), notes: "Weekend camping trip.", lines: [["4-Person Tent", 1], ["Sleeping Bag", 4], ["Camp Stove", 1]] },
    { who: { name: "Priya Nair", email: "priya.nair@example.com", phone: "555-0103" }, start: at(0, 9), end: at(0, 18), bookNow: true, lines: [["Single Kayak", 1], ["Paddle Board", 1]] },
    { who: { name: "Tomas Ivanov", email: "tomas.ivanov@example.com", phone: "555-0104" }, start: at(-9, 10), end: at(-8, 10), finished: true, lines: [["Mountain Bike", 2]] },
    { who: { name: "Lena Okafor", email: "lena.okafor@example.com", phone: "555-0105" }, start: at(-20, 9), end: at(-18, 17), finished: true, lines: [["Mirrorless Camera Kit", 1], ["Carbon Tripod", 2]] },
    { who: { name: "Amara Brooks", email: "amara.brooks@example.com", phone: "555-0101" }, start: at(-30, 9), end: at(-30, 17), finished: true, lines: [["City Bike", 1]] },
  ];

  for (const s of samples) {
    const order = await createOrder(storeId, actorUserId, {
      persons: [{ ...s.who, isLiableCustomer: true }],
      startAt: s.start,
      endAt: s.end,
      deliveryRequired: false,
      returnMethod: "STORE",
      channel: "ADMIN",
      notes: s.notes ?? null,
      bookNow: s.bookNow ?? false,
      allowOutsideHours: true,
      lines: s.lines.map(([name, quantity]) => ({ variantId: variant(name), quantity })),
    } as Parameters<typeof createOrder>[2]);
    if (s.finished) {
      // A finished rental: it started and ended when planned, and was paid.
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "COMPLETED", startedAt: s.start, endedAt: s.end, paymentStatus: "PAID", paymentMethod: "Cash" },
      });
    }
  }

  await prisma.auditLog.create({
    data: { storeId, userId: actorUserId, action: "DEMO_DATA_LOADED", entityType: "Store", entityId: storeId, diff: {} },
  });
}
