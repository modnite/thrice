import { redirect } from "next/navigation";
import { prisma } from "@thrice/db";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { holidaysSchema, openingHoursSchema } from "@thrice/shared";
import { CreateOrderClient } from "./create-order-client";

export default async function CreateOrderPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const store = await getCurrentStore(user);
  if (!store) redirect("/login");

  const [categories, products, customers] = await Promise.all([
    prisma.category.findMany({
      where: { storeId: store.storeId },
      orderBy: { displayOrder: "asc" },
    }),
    prisma.product.findMany({
      where: { storeId: store.storeId, status: "PUBLIC" },
      include: {
        categories: { select: { categoryId: true } },
        variants: {
          include: { slots: { include: { options: { include: { sku: true } } } } },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({
      where: { storeId: store.storeId },
      orderBy: { name: "asc" },
    }),
  ]);

  const storeRow = await prisma.store.findUniqueOrThrow({
    where: { id: store.storeId },
    select: { openingHours: true, holidays: true, timezone: true, currency: true },
  });
  const hoursParsed = openingHoursSchema.safeParse(storeRow.openingHours);
  const holidaysParsed = holidaysSchema.safeParse(storeRow.holidays);
  const currency = storeRow.currency;

  const productsPlain = products.map((p) => ({
    id: p.id,
    name: p.name,
    priceFrom: Number(p.priceFrom),
    categoryIds: p.categories.map((c) => c.categoryId),
    variants: p.variants.map((v) => ({
      id: v.id,
      name: v.name,
      // Most products are a single SKU behind a "Default" variant; label with
      // that SKU's code so the picker still reads like a simple product list.
      skuLabel: v.slots[0]?.options[0]?.sku.code ?? v.name,
      isSimple: v.slots.length === 1 && v.slots[0].options.length === 1,
    })),
  }));

  return (
    <CreateOrderClient
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      products={productsPlain}
      customers={customers.map((c) => ({ id: c.id, name: c.name, email: c.email }))}
      currency={currency}
      openingHours={hoursParsed.success ? hoursParsed.data : null}
      holidays={holidaysParsed.success ? holidaysParsed.data : null}
      timezone={storeRow.timezone}
    />
  );
}
