import "server-only";
import { cache } from "react";
import { prisma } from "@thrice/db";

/** The store's currency code, looked up once per request. */
export const getStoreCurrency = cache(async (storeId: string): Promise<string> => {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { currency: true } });
  return store?.currency ?? "USD";
});
