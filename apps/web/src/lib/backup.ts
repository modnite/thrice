import { gunzipSync, gzipSync } from "node:zlib";
import { prisma, Prisma } from "@thrice/db";
import { storeIsEmpty } from "./demo-data";

/**
 * A portable backup of one store's business data, and the matching restore.
 *
 * What is in it: settings, catalog, rates, stock, customers, orders (with people, items, deposits) and the audit
 * trail. What is not: user accounts and passwords, sessions, API keys and the saved mail password. Those belong to the
 * server, not the business, and secrets should not travel in a file.
 *
 * Restore only goes into an empty store (a fresh install or a store whose data was cleared), and keeps every id, so
 * links between records survive. The server-level nightly database dump remains the way to recover a whole server.
 */

const FORMAT = "thrice-backup";
const VERSION = 1;

type Table = { delegate: string; model: string; where: (storeId: string) => object };

// Parents before children, so restore can insert in this order.
const TABLES: Table[] = [
  { delegate: "category", model: "Category", where: (storeId) => ({ storeId }) },
  { delegate: "product", model: "Product", where: (storeId) => ({ storeId }) },
  { delegate: "productCategory", model: "ProductCategory", where: (storeId) => ({ product: { storeId } }) },
  { delegate: "sku", model: "Sku", where: (storeId) => ({ storeId }) },
  { delegate: "productVariant", model: "ProductVariant", where: (storeId) => ({ storeId }) },
  { delegate: "priceTier", model: "PriceTier", where: (storeId) => ({ storeId }) },
  { delegate: "variantResourceSlot", model: "VariantResourceSlot", where: (storeId) => ({ variant: { storeId } }) },
  { delegate: "variantSlotSkuOption", model: "VariantSlotSkuOption", where: (storeId) => ({ slot: { variant: { storeId } } }) },
  { delegate: "article", model: "Article", where: (storeId) => ({ storeId }) },
  { delegate: "customer", model: "Customer", where: (storeId) => ({ storeId }) },
  { delegate: "order", model: "Order", where: (storeId) => ({ storeId }) },
  { delegate: "orderDeposit", model: "OrderDeposit", where: (storeId) => ({ order: { storeId } }) },
  { delegate: "orderPerson", model: "OrderPerson", where: (storeId) => ({ order: { storeId } }) },
  { delegate: "orderBooking", model: "OrderBooking", where: (storeId) => ({ order: { storeId } }) },
  { delegate: "orderLine", model: "OrderLine", where: (storeId) => ({ booking: { order: { storeId } } }) },
  { delegate: "importRun", model: "ImportRun", where: (storeId) => ({ storeId }) },
  { delegate: "auditLog", model: "AuditLog", where: (storeId) => ({ storeId }) },
];

/** The store's own settings. Server-level and secret ones (mail password, public addresses, slug) stay out. */
const STORE_SETTING_FIELDS = [
  "name", "tagline", "address", "phone", "email", "currency", "timezone", "openingHours", "holidays",
  "paymentMethodConfig", "emailSubject", "emailIntro", "emailFooter", "sendConfirmationOnCreate",
] as const;

export type BackupCounts = Record<string, number>;
export type BackupFile = {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  storeName: string;
  counts: BackupCounts;
  store: Record<string, unknown>;
  tables: Record<string, Record<string, unknown>[]>;
};

// The delegates are looked up by name because every table follows the same pattern.
const delegateOf = (client: unknown, name: string) =>
  (client as Record<string, { findMany: (a: object) => Promise<Record<string, unknown>[]>; createMany: (a: object) => Promise<unknown> }>)[name]!;

export async function createBackup(storeId: string): Promise<{ file: Buffer; name: string; counts: BackupCounts }> {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  const tables: BackupFile["tables"] = {};
  const counts: BackupCounts = {};
  for (const t of TABLES) {
    const rows = await delegateOf(prisma, t.delegate).findMany({ where: t.where(storeId) });
    tables[t.model] = rows;
    counts[t.model] = rows.length;
  }
  const settings: Record<string, unknown> = {};
  for (const f of STORE_SETTING_FIELDS) settings[f] = (store as Record<string, unknown>)[f];

  const body: BackupFile = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), storeName: store.name, counts, store: settings, tables };
  const stamp = body.exportedAt.slice(0, 10);
  const slug = store.slug.replace(/[^a-z0-9-]/gi, "");
  return { file: gzipSync(Buffer.from(JSON.stringify(body))), name: `thrice-backup-${slug}-${stamp}.json.gz`, counts };
}

export class BackupError extends Error {}

/** Field names and kinds for a model, from Prisma's own description of the schema. */
function fieldsOf(model: string) {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === model);
  if (!m) throw new BackupError(`This build does not know about ${model}.`);
  return m.fields.filter((f) => f.kind === "scalar" || f.kind === "enum");
}

export function parseBackup(raw: Buffer): BackupFile {
  let data: unknown;
  try {
    const text = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw).toString("utf-8") : raw.toString("utf-8");
    data = JSON.parse(text);
  } catch {
    throw new BackupError("That file is not a THRICE backup.");
  }
  const b = data as Partial<BackupFile>;
  if (b?.format !== FORMAT || typeof b.version !== "number" || !b.tables || !b.store) throw new BackupError("That file is not a THRICE backup.");
  if (b.version > VERSION) throw new BackupError("That backup was made by a newer version of THRICE. Update THRICE first.");
  return b as BackupFile;
}

export async function restoreBackup(storeId: string, backup: BackupFile): Promise<BackupCounts> {
  if (!(await storeIsEmpty(storeId))) {
    throw new BackupError("This store already has data. A backup can only be restored into an empty store, such as a fresh install.");
  }

  const restored: BackupCounts = {};
  await prisma.$transaction(
    async (tx) => {
      // Settings first: the store keeps its own id, address and mail settings.
      const settings: Record<string, unknown> = {};
      for (const f of STORE_SETTING_FIELDS) {
        if (f in backup.store) settings[f] = backup.store[f] === null && (f === "openingHours" || f === "holidays" || f === "paymentMethodConfig") ? Prisma.DbNull : backup.store[f];
      }
      await tx.store.update({ where: { id: storeId }, data: settings as Prisma.StoreUpdateInput });

      for (const t of TABLES) {
        const rows = backup.tables[t.model] ?? [];
        if (rows.length === 0) {
          restored[t.model] = 0;
          continue;
        }
        const fields = fieldsOf(t.model);
        const prepared = rows.map((row) => {
          const out: Record<string, unknown> = {};
          for (const f of fields) {
            if (!(f.name in row)) continue;
            let v = row[f.name];
            if (v === null) {
              // Optional Json columns need Prisma's explicit null marker.
              out[f.name] = f.type === "Json" ? Prisma.DbNull : null;
              continue;
            }
            if (f.type === "DateTime" && typeof v === "string") v = new Date(v);
            out[f.name] = v;
          }
          if (fields.some((f) => f.name === "storeId")) out.storeId = storeId;
          if (t.model === "AuditLog") out.userId = null; // accounts are not part of a backup
          return out;
        });
        for (let i = 0; i < prepared.length; i += 1000) {
          await delegateOf(tx, t.delegate).createMany({ data: prepared.slice(i, i + 1000) });
        }
        restored[t.model] = rows.length;
      }
    },
    { timeout: 10 * 60_000, maxWait: 15_000 }
  );
  return restored;
}
