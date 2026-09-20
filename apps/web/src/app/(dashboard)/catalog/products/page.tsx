import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, type Prisma } from "@thrice/db";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { formatMoney } from "@/lib/format";
import { NewProductForm } from "../forms";
import { RatesImport } from "../rates-import";

const PAGE_SIZE = 50;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; category?: string; page?: string; new?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await getCurrentStore(user);
  if (!membership) redirect("/login");
  // Customers and Catalog are for owners and admins only.
  if (membership.role === "STAFF") redirect("/");

  const { q, status, category, page: pageRaw, new: showNew } = await searchParams;
  const page = Math.max(1, Number(pageRaw) || 1);
  const canEdit = true; // staff never reach the catalog, so everyone here can edit

  const where: Prisma.ProductWhereInput = {
    storeId: membership.storeId,
    ...(status === "PUBLIC" ? { status: "PUBLIC" as const } : status === "HIDDEN" ? { status: "HIDDEN" as const } : {}),
    ...(category ? { categories: { some: { categoryId: category } } } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [products, total, categories, skus] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { categories: { include: { category: true } }, variants: { include: { priceTiers: { select: { id: true } } } } },
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
    prisma.category.findMany({ where: { storeId: membership.storeId }, orderBy: { displayOrder: "asc" } }),
    showNew && canEdit
      ? prisma.sku.findMany({ where: { storeId: membership.storeId }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } })
      : Promise.resolve([]),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (status) next.set("status", status);
    if (category) next.set("category", category);
    next.set("page", String(p));
    return `/catalog/products?${next.toString()}`;
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        {canEdit && (
          <Link href="/catalog/products?new=1" className="btn-primary">
            New product
          </Link>
        )}
      </div>

      {showNew && canEdit && (
        <div className="mb-6 max-w-xl">
          <NewProductForm skus={skus.map((s) => ({ id: s.id, label: `${s.code} - ${s.name}` }))} />
        </div>
      )}

      <RatesImport />

      <form className="mb-4 flex flex-wrap gap-3">
        <input name="q" defaultValue={q} placeholder="Search products" className="input max-w-sm" />
        <select name="status" defaultValue={status ?? ""} className="input max-w-[160px]">
          <option value="">All visibility</option>
          <option value="PUBLIC">Public</option>
          <option value="HIDDEN">Hidden</option>
        </select>
        <select name="category" defaultValue={category ?? ""} className="input max-w-[220px]">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn">
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-700">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Visibility</th>
              <th className="px-4 py-3 font-medium">Categories</th>
              <th className="px-4 py-3 font-medium">Variants</th>
              <th className="px-4 py-3 font-medium">Rates</th>
              <th className="px-4 py-3 font-medium">From</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const rated = p.variants.filter((v) => v.priceTiers.length > 0).length;
              return (
                <tr key={p.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link href={`/catalog/products/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${p.status === "PUBLIC" ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-600"}`}>
                      {p.status === "PUBLIC" ? "Public" : "Hidden"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{p.categories.map((c) => c.category.name).join(", ") || "-"}</td>
                  <td className="px-4 py-3">{p.variants.length}</td>
                  <td className="px-4 py-3">
                    {rated === p.variants.length && rated > 0 ? (
                      <span className="text-green-700">Set</span>
                    ) : (
                      <span className="text-red-600">{rated}/{p.variants.length} priced</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{formatMoney(p.priceFrom.toString())}</td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-neutral-400">
                  No products match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
        <span>
          {total} product{total === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-3">
          {page > 1 && (
            <Link href={href(page - 1)} className="btn">
              Previous
            </Link>
          )}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link href={href(page + 1)} className="btn">
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
