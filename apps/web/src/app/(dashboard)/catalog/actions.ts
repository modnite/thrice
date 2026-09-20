"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma, prisma } from "@thrice/db";
import { requireSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { replaceVariantRates } from "@/lib/rates";
import { parseRatesCsv } from "@thrice/shared";

export type CatalogState = { error?: string; saved?: boolean };

async function requireCatalogEditor() {
  const user = await requireSessionUser();
  const membership = await getCurrentStore(user);
  if (!membership) throw new Error("NO_STORE");
  if (membership.role === "STAFF") throw new Error("FORBIDDEN");
  return { user, storeId: membership.storeId };
}

async function audit(storeId: string, userId: string, action: string, entityType: string, entityId: string, diff?: object) {
  await prisma.auditLog.create({ data: { storeId, userId, action, entityType, entityId, diff } });
}

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

// ---------------------------------------------------------------- products

export async function createProductAction(_prev: CatalogState, formData: FormData): Promise<CatalogState> {
  const { user, storeId } = await requireCatalogEditor();
  const name = String(formData.get("name") ?? "").trim();
  const skuId = String(formData.get("skuId") ?? "");
  if (!name) return { error: "Enter a product name." };

  if (skuId) {
    const sku = await prisma.sku.findFirst({ where: { id: skuId, storeId }, select: { id: true } });
    if (!sku) return { error: "That SKU no longer exists." };
  }

  let productId: string;
  try {
    productId = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data: { storeId, name } });
      const variant = await tx.productVariant.create({ data: { storeId, productId: product.id, name: "Default" } });
      const slot = await tx.variantResourceSlot.create({ data: { variantId: variant.id, slotIndex: 0, quantity: 1 } });
      if (skuId) await tx.variantSlotSkuOption.create({ data: { slotId: slot.id, skuId } });
      return product.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A product with that name already exists." };
    throw err;
  }
  await audit(storeId, user.id, "PRODUCT_CREATED", "Product", productId, { name });
  redirect(`/catalog/products/${productId}?tab=pricing`);
}

const productSchema = z.object({
  name: z.string().trim().min(1, "Enter a product name.").max(200),
  status: z.enum(["PUBLIC", "HIDDEN"]),
  deposit: z.coerce.number().min(0).max(1_000_000),
  taxPercentage: z.union([z.literal(""), z.coerce.number().min(0).max(100)]),
  tags: z.string().max(500),
});

export async function updateProductAction(productId: string, _prev: CatalogState, formData: FormData): Promise<CatalogState> {
  const { user, storeId } = await requireCatalogEditor();
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    status: formData.get("status"),
    deposit: formData.get("deposit") || 0,
    taxPercentage: formData.get("taxPercentage") ?? "",
    tags: formData.get("tags") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid product." };

  const categoryIds = formData.getAll("categoryIds").map(String);
  const validCategories = await prisma.category.findMany({ where: { storeId, id: { in: categoryIds } }, select: { id: true } });
  const d = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.findFirstOrThrow({ where: { id: productId, storeId }, select: { id: true } });
      await tx.product.update({
        where: { id: productId },
        data: {
          name: d.name,
          status: d.status,
          deposit: d.deposit,
          taxPercentage: d.taxPercentage === "" ? null : d.taxPercentage,
          tags: d.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      });
      await tx.productCategory.deleteMany({ where: { productId } });
      if (validCategories.length > 0) {
        await tx.productCategory.createMany({ data: validCategories.map((c) => ({ productId, categoryId: c.id })) });
      }
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A product with that name already exists." };
    throw err;
  }
  await audit(storeId, user.id, "PRODUCT_UPDATED", "Product", productId, { name: d.name, status: d.status });
  revalidatePath(`/catalog/products/${productId}`);
  return { saved: true };
}

export async function deleteProductAction(productId: string, _prev: CatalogState): Promise<CatalogState> {
  const { user, storeId } = await requireCatalogEditor();
  const product = await prisma.product.findFirst({ where: { id: productId, storeId }, select: { name: true } });
  if (!product) return { error: "Product not found." };
  const bookings = await prisma.orderBooking.count({ where: { productId } });
  if (bookings > 0) {
    return { error: `This product appears on ${bookings} booking${bookings === 1 ? "" : "s"}. Hide it instead of deleting it.` };
  }
  await prisma.product.delete({ where: { id: productId } });
  await audit(storeId, user.id, "PRODUCT_DELETED", "Product", productId, { name: product.name });
  redirect("/catalog/products");
}

// ------------------------------------------------------------------- rates

const rateSchema = z
  .array(
    z.object({
      durationMinutes: z.number().int().positive().max(60 * 24 * 365).nullable(),
      price: z.number().min(0).max(10_000_000),
      additionalPrice: z.number().min(0).max(10_000_000).nullable(),
    })
  )
  .max(50);

export async function saveRatesAction(variantId: string, _prev: CatalogState, formData: FormData): Promise<CatalogState> {
  const { user, storeId } = await requireCatalogEditor();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("rates") ?? "[]"));
  } catch {
    return { error: "Could not read the rates." };
  }
  const parsed = rateSchema.safeParse(raw);
  if (!parsed.success) return { error: "Check the rates: durations must be positive and prices can't be negative." };
  const rows = parsed.data;

  const flat = rows.filter((r) => r.durationMinutes === null);
  const timed = rows.filter((r) => r.durationMinutes !== null);
  if (flat.length > 0 && timed.length > 0) return { error: "Use either one flat price or duration-based rates, not both." };
  if (flat.length > 1) return { error: "Only one flat price is allowed." };
  const mode = formData.get("mode") === "CALENDAR_DAYS" ? "CALENDAR_DAYS" : "ELAPSED";
  if (mode === "CALENDAR_DAYS" && (flat.length > 0 || timed.some((r) => (r.durationMinutes as number) % 1440 !== 0))) {
    return { error: "Calendar-day pricing needs rates in whole days or weeks (no hours or minutes, no flat price)." };
  }
  const durations = timed.map((r) => r.durationMinutes);
  if (new Set(durations).size !== durations.length) return { error: "Two rates have the same duration." };

  const variant = await prisma.productVariant.findFirst({ where: { id: variantId, storeId }, select: { id: true, productId: true } });
  if (!variant) return { error: "Variant not found." };

  await prisma.$transaction((tx) => replaceVariantRates(tx, storeId, variant, mode, rows));
  await audit(storeId, user.id, "RATES_UPDATED", "ProductVariant", variantId, { rows: rows.length });
  revalidatePath(`/catalog/products/${variant.productId}`);
  return { saved: true };
}

// ---------------------------------------------------------------- variants

async function ownedVariant(storeId: string, variantId: string) {
  return prisma.productVariant.findFirst({ where: { id: variantId, storeId }, include: { slots: true } });
}

export async function addVariantAction(productId: string, _prev: CatalogState, formData: FormData): Promise<CatalogState> {
  const { user, storeId } = await requireCatalogEditor();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a variant name." };
  const product = await prisma.product.findFirst({ where: { id: productId, storeId }, select: { id: true } });
  if (!product) return { error: "Product not found." };
  try {
    await prisma.$transaction(async (tx) => {
      const count = await tx.productVariant.count({ where: { productId } });
      const variant = await tx.productVariant.create({ data: { storeId, productId, name, displayOrder: count } });
      await tx.variantResourceSlot.create({ data: { variantId: variant.id, slotIndex: 0, quantity: 1 } });
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "This product already has a variant with that name." };
    throw err;
  }
  await audit(storeId, user.id, "VARIANT_ADDED", "Product", productId, { name });
  revalidatePath(`/catalog/products/${productId}`);
  return { saved: true };
}

export async function renameVariantAction(variantId: string, formData: FormData) {
  const { storeId } = await requireCatalogEditor();
  const name = String(formData.get("name") ?? "").trim();
  const variant = await ownedVariant(storeId, variantId);
  if (!variant || !name) return;
  try {
    await prisma.productVariant.update({ where: { id: variantId }, data: { name } });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
  revalidatePath(`/catalog/products/${variant.productId}`);
}

export async function deleteVariantAction(variantId: string, _prev: CatalogState): Promise<CatalogState> {
  const { user, storeId } = await requireCatalogEditor();
  const variant = await ownedVariant(storeId, variantId);
  if (!variant) return { error: "Variant not found." };
  const [siblings, bookings] = await Promise.all([
    prisma.productVariant.count({ where: { productId: variant.productId } }),
    prisma.orderBooking.count({ where: { variantId } }),
  ]);
  if (siblings <= 1) return { error: "A product needs at least one variant." };
  if (bookings > 0) return { error: `This variant is on ${bookings} booking${bookings === 1 ? "" : "s"} and can't be deleted.` };
  await prisma.productVariant.delete({ where: { id: variantId } });
  await audit(storeId, user.id, "VARIANT_DELETED", "ProductVariant", variantId);
  revalidatePath(`/catalog/products/${variant.productId}`);
  return {};
}

export async function addSlotAction(variantId: string) {
  const { storeId } = await requireCatalogEditor();
  const variant = await ownedVariant(storeId, variantId);
  if (!variant) return;
  const next = variant.slots.reduce((m, s) => Math.max(m, s.slotIndex), -1) + 1;
  await prisma.variantResourceSlot.create({ data: { variantId, slotIndex: next, quantity: 1 } });
  revalidatePath(`/catalog/products/${variant.productId}`);
}

async function ownedSlot(storeId: string, slotId: string) {
  return prisma.variantResourceSlot.findFirst({
    where: { id: slotId, variant: { storeId } },
    include: { variant: { include: { slots: true } }, options: true },
  });
}

export async function removeSlotAction(slotId: string) {
  const { storeId } = await requireCatalogEditor();
  const slot = await ownedSlot(storeId, slotId);
  if (!slot || slot.variant.slots.length <= 1) return;
  const used = await prisma.orderLine.count({ where: { slotId } });
  if (used > 0) return;
  await prisma.variantResourceSlot.delete({ where: { id: slotId } });
  revalidatePath(`/catalog/products/${slot.variant.productId}`);
}

export async function setSlotQuantityAction(slotId: string, formData: FormData) {
  const { storeId } = await requireCatalogEditor();
  const slot = await ownedSlot(storeId, slotId);
  const quantity = Math.floor(Number(formData.get("quantity")));
  if (!slot || !Number.isFinite(quantity) || quantity < 1 || quantity > 999) return;
  await prisma.variantResourceSlot.update({ where: { id: slotId }, data: { quantity } });
  revalidatePath(`/catalog/products/${slot.variant.productId}`);
}

export async function addSlotOptionAction(slotId: string, formData: FormData) {
  const { storeId } = await requireCatalogEditor();
  const slot = await ownedSlot(storeId, slotId);
  const skuId = String(formData.get("skuId") ?? "");
  if (!slot || !skuId) return;
  const sku = await prisma.sku.findFirst({ where: { id: skuId, storeId }, select: { id: true } });
  if (!sku) return;
  await prisma.variantSlotSkuOption.upsert({
    where: { slotId_skuId: { slotId, skuId } },
    update: {},
    create: { slotId, skuId },
  });
  revalidatePath(`/catalog/products/${slot.variant.productId}`);
}

export async function removeSlotOptionAction(slotId: string, skuId: string) {
  const { storeId } = await requireCatalogEditor();
  const slot = await ownedSlot(storeId, slotId);
  if (!slot) return;
  const used = await prisma.orderLine.count({ where: { slotId, skuId } });
  if (used > 0) return;
  await prisma.variantSlotSkuOption.deleteMany({ where: { slotId, skuId } });
  revalidatePath(`/catalog/products/${slot.variant.productId}`);
}

// -------------------------------------------------------------- categories

export async function createCategoryAction(_prev: CatalogState, formData: FormData): Promise<CatalogState> {
  const { user, storeId } = await requireCatalogEditor();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a category name." };
  try {
    const count = await prisma.category.count({ where: { storeId } });
    const category = await prisma.category.create({ data: { storeId, name, displayOrder: count } });
    await audit(storeId, user.id, "CATEGORY_CREATED", "Category", category.id, { name });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A category with that name already exists." };
    throw err;
  }
  revalidatePath("/catalog/categories");
  return { saved: true };
}

export async function updateCategoryAction(categoryId: string, formData: FormData) {
  const { storeId } = await requireCatalogEditor();
  const name = String(formData.get("name") ?? "").trim();
  const displayOrder = Math.floor(Number(formData.get("displayOrder")));
  if (!name) return;
  try {
    await prisma.category.updateMany({
      where: { id: categoryId, storeId },
      data: { name, description: String(formData.get("description") ?? "").trim() || null, ...(Number.isFinite(displayOrder) ? { displayOrder } : {}) },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
  revalidatePath("/catalog/categories");
}

export async function deleteCategoryAction(categoryId: string) {
  const { user, storeId } = await requireCatalogEditor();
  const deleted = await prisma.category.deleteMany({ where: { id: categoryId, storeId } });
  if (deleted.count > 0) await audit(storeId, user.id, "CATEGORY_DELETED", "Category", categoryId);
  revalidatePath("/catalog/categories");
}

// ------------------------------------------------------- rates spreadsheet

export type RatesImportState = { applied?: number; skipped?: string[]; errors?: string[]; error?: string };

const MAX_RATES_FILE_BYTES = 2 * 1024 * 1024;

/** Applies a rates spreadsheet: each product/variant found has its rates replaced. Safe to re-run. */
export async function importRatesAction(_prev: RatesImportState, formData: FormData): Promise<RatesImportState> {
  const { user, storeId } = await requireCatalogEditor();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file first." };
  if (file.size > MAX_RATES_FILE_BYTES) return { error: "That file is too large for a rates spreadsheet." };

  const { groups, errors } = parseRatesCsv(await file.text());

  const products = await prisma.product.findMany({
    where: { storeId },
    select: { id: true, name: true, variants: { select: { id: true, name: true } } },
  });
  const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]));

  let applied = 0;
  const skipped: string[] = [];
  for (const g of groups) {
    const product = byName.get(g.product.trim().toLowerCase());
    if (!product) {
      skipped.push(`${g.product}: no product with that name.`);
      continue;
    }
    const variant = product.variants.find((v) => v.name.toLowerCase() === g.variant.toLowerCase());
    if (!variant) {
      skipped.push(`${g.product}: no variant called "${g.variant}".`);
      continue;
    }
    await prisma.$transaction((tx) => replaceVariantRates(tx, storeId, { id: variant.id, productId: product.id }, g.mode, g.rows));
    applied++;
  }

  await audit(storeId, user.id, "RATES_IMPORTED", "Product", storeId, { applied, skipped: skipped.length, errors: errors.length });
  revalidatePath("/catalog/products");
  return { applied, skipped, errors: errors.map((e) => (e.line > 0 ? `Line ${e.line}: ${e.message}` : e.message)) };
}
