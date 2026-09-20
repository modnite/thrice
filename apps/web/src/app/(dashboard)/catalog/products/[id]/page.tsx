import { currencySymbol } from "@thrice/shared/currency";
import { getStoreCurrency } from "@/lib/store-currency";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@thrice/db";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { formatDateTime } from "@/lib/format";
import {
  addSlotAction,
  addSlotOptionAction,
  removeSlotAction,
  removeSlotOptionAction,
  renameVariantAction,
  setSlotQuantityAction,
} from "../../actions";
import { AddVariantForm, DeleteProductForm, DeleteVariantButton, ProductForm } from "../../forms";
import { RatesEditor } from "./rates-editor";

const TABS = [
  ["general", "General"],
  ["pricing", "Pricing"],
  ["variants", "Variants"],
  ["availability", "Availability"],
  ["settings", "Settings"],
] as const;

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await getCurrentStore(user);
  if (!membership) redirect("/login");
  // Customers and Catalog are for owners and admins only.
  if (membership.role === "STAFF") redirect("/");
  const sym = currencySymbol(await getStoreCurrency(membership.storeId));
  const canEdit = true; // staff never reach the catalog, so everyone here can edit

  const { id } = await params;
  const { tab: tabRaw } = await searchParams;
  const tab = TABS.find(([k]) => k === tabRaw)?.[0] ?? "general";

  const product = await prisma.product.findFirst({
    where: { id, storeId: membership.storeId },
    include: {
      categories: true,
      variants: {
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        include: {
          priceTiers: { orderBy: { displayOrder: "asc" } },
          slots: { orderBy: { slotIndex: "asc" }, include: { options: { include: { sku: true } } } },
        },
      },
    },
  });
  if (!product) notFound();

  const skuIds = [...new Set(product.variants.flatMap((v) => v.slots.flatMap((s) => s.options.map((o) => o.skuId))))];

  const [categories, allSkus, stock, booked, tz] = await Promise.all([
    tab === "general" ? prisma.category.findMany({ where: { storeId: membership.storeId }, orderBy: { displayOrder: "asc" } }) : Promise.resolve([]),
    tab === "variants" && canEdit
      ? prisma.sku.findMany({ where: { storeId: membership.storeId }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } })
      : Promise.resolve([]),
    tab === "availability"
      ? prisma.article.groupBy({ by: ["skuId", "status"], where: { storeId: membership.storeId, skuId: { in: skuIds } }, _sum: { quantity: true }, _count: true })
      : Promise.resolve([]),
    tab === "availability"
      ? prisma.orderLine.findMany({
          where: { skuId: { in: skuIds }, booking: { order: { status: { in: ["UPCOMING", "ACTIVE"] } } } },
          include: { booking: { include: { order: { include: { persons: true } } } } },
          orderBy: { booking: { order: { startAt: "asc" } } },
          take: 200,
        })
      : Promise.resolve([]),
    prisma.store.findUniqueOrThrow({ where: { id: membership.storeId }, select: { timezone: true } }).then((s) => s.timezone),
  ]);

  return (
    <div className="p-4 md:p-8">
      <Link href="/catalog/products" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Products
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">{product.name}</h1>
      <p className="mb-6 text-sm text-neutral-500">{product.status === "PUBLIC" ? "Public" : "Hidden"}</p>

      <div className="mb-6 flex gap-6 border-b border-neutral-200">
        {TABS.map(([key, label]) => (
          <Link key={key} href={`/catalog/products/${product.id}?tab=${key}`} className={`tab ${tab === key ? "tab-active" : ""}`}>
            {label}
          </Link>
        ))}
      </div>

      {!canEdit && tab !== "availability" && (
        <p className="mb-4 rounded bg-amber-50 p-3 text-sm text-amber-800">Only owners and admins can edit the catalog.</p>
      )}

      {tab === "general" && canEdit && (
        <ProductForm
          productId={product.id}
          product={{
            name: product.name,
            status: product.status,
            deposit: product.deposit.toString(),
            taxPercentage: product.taxPercentage?.toString() ?? "",
            tags: product.tags.join(", "),
          }}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          selectedCategoryIds={product.categories.map((c) => c.categoryId)}
        />
      )}

      {tab === "pricing" && (
        <div className="max-w-3xl space-y-6">
          {product.variants.map((v) => (
            <div key={v.id} className="card space-y-3">
              <h2 className="font-semibold">{v.name === "Default" ? "Rates" : v.name}</h2>
              {v.slots.every((s) => s.options.length === 0) && (
                <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">
                  This variant has no inventory linked yet, so it can&apos;t be booked. Link a SKU on the Variants tab.
                </p>
              )}
              {canEdit ? (
                <RatesEditor
                  key={`${v.id}-${v.updatedAt.toISOString()}`}
                  variantId={v.id}
                  initialMode={v.pricingMode}
                  initial={v.priceTiers.map((t) => ({
                    durationMinutes: t.durationMinutes,
                    price: Number(t.price),
                    additionalPrice: t.additionalPrice === null ? null : Number(t.additionalPrice),
                  }))}
                />
              ) : (
                <ul className="text-sm">
                  {v.priceTiers.map((t) => (
                    <li key={t.id}>
                      {t.durationMinutes === null ? "Flat" : `${t.durationMinutes / 60} h`}: {sym}{Number(t.price).toFixed(2)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "variants" && (
        <div className="max-w-3xl space-y-4">
          <p className="text-sm text-neutral-600">
            A variant needs one or more <strong>resources</strong>. Each resource can be filled by any of its SKUs (for example
            &ldquo;Kit A&rdquo; or &ldquo;Kit B&rdquo;), so a bundle is a variant with several resources.
          </p>
          {product.variants.map((v) => (
            <div key={v.id} className="card space-y-4">
              <div className="flex items-center justify-between gap-3">
                {canEdit ? (
                  <form action={renameVariantAction.bind(null, v.id)} className="flex items-center gap-2">
                    <input name="name" defaultValue={v.name} className="input w-64 font-medium" />
                    <button type="submit" className="btn py-1 text-xs">
                      Rename
                    </button>
                  </form>
                ) : (
                  <h2 className="font-semibold">{v.name}</h2>
                )}
                {canEdit && <DeleteVariantButton variantId={v.id} />}
              </div>

              {v.slots.map((s, i) => (
                <div key={s.id} className="rounded-lg border border-neutral-200 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium">Resource {i + 1}</span>
                    {canEdit && (
                      <div className="flex items-center gap-3">
                        <form action={setSlotQuantityAction.bind(null, s.id)} className="flex items-center gap-1 text-xs">
                          <label className="text-neutral-500">Units per booking</label>
                          <input name="quantity" type="number" min={1} defaultValue={s.quantity} className="input w-16 py-1" />
                          <button type="submit" className="btn py-1 text-xs">
                            Set
                          </button>
                        </form>
                        {v.slots.length > 1 && (
                          <form action={removeSlotAction.bind(null, s.id)}>
                            <button type="submit" className="text-xs text-red-600 hover:underline">
                              Remove resource
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                  <ul className="space-y-1 text-sm">
                    {s.options.map((o) => (
                      <li key={o.id} className="flex items-center justify-between">
                        <span>
                          <span className="font-mono text-xs text-neutral-500">{o.sku.code}</span> {o.sku.name}
                        </span>
                        {canEdit && s.options.length > 1 && (
                          <form action={removeSlotOptionAction.bind(null, s.id, o.skuId)}>
                            <button type="submit" className="text-xs text-red-600 hover:underline">
                              Remove
                            </button>
                          </form>
                        )}
                      </li>
                    ))}
                    {s.options.length === 0 && <li className="text-amber-700">No SKU linked yet.</li>}
                  </ul>
                  {canEdit && (
                    <form action={addSlotOptionAction.bind(null, s.id)} className="mt-2 flex gap-2">
                      <select name="skuId" className="input flex-1 py-1 text-xs" defaultValue="">
                        <option value="" disabled>
                          Add an alternative SKU...
                        </option>
                        {allSkus.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.code} - {k.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="btn py-1 text-xs">
                        Add
                      </button>
                    </form>
                  )}
                </div>
              ))}
              {canEdit && (
                <form action={addSlotAction.bind(null, v.id)}>
                  <button type="submit" className="text-sm text-brand">
                    + Add another resource (bundle)
                  </button>
                </form>
              )}
            </div>
          ))}
          {canEdit && <AddVariantForm productId={product.id} />}
        </div>
      )}

      {tab === "availability" && (
        <div className="max-w-4xl space-y-6">
          {skuIds.length === 0 && <p className="text-neutral-500">No inventory linked to this product yet.</p>}
          {product.variants
            .flatMap((v) => v.slots.flatMap((s) => s.options.map((o) => o.sku)))
            .filter((sku, i, arr) => arr.findIndex((x) => x.id === sku.id) === i)
            .map((sku) => {
              const rows = stock.filter((r) => r.skuId === sku.id);
              const inUse = rows.filter((r) => r.status === "IN_USE").reduce((n, r) => n + (r._sum.quantity ?? 0), 0);
              const other = rows.filter((r) => r.status !== "IN_USE").reduce((n, r) => n + (r._sum.quantity ?? 0), 0);
              const lines = booked.filter((l) => l.skuId === sku.id);
              return (
                <div key={sku.id} className="card space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-semibold">
                      <span className="font-mono text-xs text-neutral-500">{sku.code}</span> {sku.name}
                    </h2>
                    <p className="text-sm text-neutral-600">
                      {inUse} in use
                      {other > 0 && <span className="text-neutral-400">, {other} out of use or lost</span>} &middot; {sku.trackedIndividually ? "tracked individually" : "bulk stock"}
                    </p>
                  </div>
                  {lines.length === 0 ? (
                    <p className="text-sm text-neutral-500">No upcoming or active bookings.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-neutral-500">
                        <tr>
                          <th className="py-1 font-medium">Order</th>
                          <th className="py-1 font-medium">Customer</th>
                          <th className="py-1 font-medium">Window</th>
                          <th className="py-1 font-medium">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l) => {
                          const o = l.booking.order;
                          const cust = (o.persons.find((p) => p.isLiableCustomer) ?? o.persons[0])?.name ?? "-";
                          return (
                            <tr key={l.id} className="border-t border-neutral-100">
                              <td className="py-1">
                                <Link href={`/orders/${o.id}`} className="hover:underline">
                                  #{o.orderNumber}
                                </Link>
                              </td>
                              <td className="py-1">{cust}</td>
                              <td className="py-1 text-neutral-600">
                                {formatDateTime(l.booking.startAt ?? o.startAt, tz)} - {formatDateTime(l.booking.endAt ?? o.endAt, tz)}
                              </td>
                              <td className="py-1">{l.quantity}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {tab === "settings" && canEdit && <DeleteProductForm productId={product.id} />}
    </div>
  );
}
