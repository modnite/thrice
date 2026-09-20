"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@thrice/db";
import { requireSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";

export type StockState = { error?: string; saved?: boolean };

async function requireStore() {
  const user = await requireSessionUser();
  const membership = await getCurrentStore(user);
  if (!membership) throw new Error("NO_STORE");
  return { user, storeId: membership.storeId };
}

const STATUSES = ["IN_USE", "OUT_OF_USE", "LOST"] as const;

/** Marks a stock item in use, out of use or lost. Open orders holding it will show a stock conflict. */
export async function setArticleStatusAction(articleId: string, formData: FormData) {
  const { user, storeId } = await requireStore();
  const status = STATUSES.find((s) => s === formData.get("status"));
  if (!status) return;
  const result = await prisma.article.updateMany({ where: { id: articleId, storeId }, data: { status } });
  if (result.count > 0) {
    await prisma.auditLog.create({
      data: { storeId, userId: user.id, action: "ARTICLE_STATUS_CHANGED", entityType: "Article", entityId: articleId, diff: { status } },
    });
  }
  revalidatePath("/inventory");
}

export async function addArticleAction(_prev: StockState, formData: FormData): Promise<StockState> {
  const { user, storeId } = await requireStore();
  const skuId = String(formData.get("skuId") ?? "");
  const sku = await prisma.sku.findFirst({ where: { id: skuId, storeId } });
  if (!sku) return { error: "Choose a SKU." };

  const rawCode = String(formData.get("articleCode") ?? "").trim();
  if (sku.trackedIndividually && !rawCode) return { error: "This SKU is tracked individually, so enter the serial / article ID." };
  const articleCode = rawCode || sku.code;

  const quantity = sku.trackedIndividually ? 1 : Math.floor(Number(formData.get("quantity") ?? 1));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 100_000) return { error: "Enter a quantity of at least 1." };

  const priceRaw = String(formData.get("purchasePrice") ?? "").trim();
  const purchasePrice = priceRaw === "" ? null : Number(priceRaw);
  if (purchasePrice !== null && (!Number.isFinite(purchasePrice) || purchasePrice < 0)) return { error: "Enter a valid purchase price." };
  const dateRaw = String(formData.get("purchaseDate") ?? "").trim();
  const purchaseDate = dateRaw === "" ? null : new Date(`${dateRaw}T00:00:00Z`);
  if (purchaseDate && Number.isNaN(purchaseDate.getTime())) return { error: "Enter a valid purchase date." };

  try {
    const article = await prisma.article.create({
      data: { storeId, skuId, articleCode, quantity, purchasePrice, purchaseDate, purchaseCurrency: purchasePrice === null ? null : "TTD" },
    });
    await prisma.auditLog.create({
      data: { storeId, userId: user.id, action: "ARTICLE_ADDED", entityType: "Article", entityId: article.id, diff: { articleCode, quantity } },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: `A stock item with ID "${articleCode}" already exists.` };
    }
    throw err;
  }
  revalidatePath("/inventory");
  return { saved: true };
}

export async function deleteArticleAction(articleId: string) {
  const { user, storeId } = await requireStore();
  const article = await prisma.article.findFirst({ where: { id: articleId, storeId }, include: { _count: { select: { orderLines: true } } } });
  // Anything that has ever been on an order is history: mark it lost or out of use instead.
  if (!article || article._count.orderLines > 0) return;
  await prisma.article.delete({ where: { id: articleId } });
  await prisma.auditLog.create({
    data: { storeId, userId: user.id, action: "ARTICLE_DELETED", entityType: "Article", entityId: articleId, diff: { articleCode: article.articleCode } },
  });
  revalidatePath("/inventory");
}
