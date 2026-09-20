import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Upload } from "lucide-react";
import { prisma, type Prisma } from "@thrice/db";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { formatDate, formatMoney } from "@/lib/format";
import { InventoryFilters } from "./inventory-filters";
import { AddStockItemForm, ArticleStatusSelect, DeleteArticleButton } from "./stock-controls";

const PAGE_SIZE = 50;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; allocation?: string; page?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const store = await getCurrentStore(user);
  if (!store) redirect("/login");

  const { q, status, allocation, page: pageRaw } = await searchParams;
  const page = Math.max(1, Number(pageRaw) || 1);

  const where: Prisma.ArticleWhereInput = {
    storeId: store.storeId,
    ...(status === "IN_USE" || status === "OUT_OF_USE" || status === "LOST" ? { status } : {}),
    ...(allocation === "RENTAL" || allocation === "SALE" ? { allocation } : {}),
    ...(q
      ? {
          OR: [
            { articleCode: { contains: q, mode: "insensitive" } },
            { sku: { code: { contains: q, mode: "insensitive" } } },
            { sku: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [articles, total, skus] = await Promise.all([
    prisma.article.findMany({
      where,
      include: { sku: true, _count: { select: { orderLines: true } } },
      orderBy: { articleCode: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.article.count({ where }),
    prisma.sku.findMany({
      where: { storeId: store.storeId },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, trackedIndividually: true },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const pageHref = (p: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (status) next.set("status", status);
    if (allocation) next.set("allocation", allocation);
    next.set("page", String(p));
    return `/inventory?${next.toString()}`;
  };

  const th = "whitespace-nowrap px-4 py-3 font-medium";
  const td = "whitespace-nowrap px-4 py-3";

  return (
    <div className="p-4 md:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <Link href="/inventory/import" className="btn flex items-center gap-2">
          <Upload size={14} /> Import CSV
        </Link>
      </div>

      <InventoryFilters q={q} status={status} allocation={allocation} />

      <details className="mb-4 rounded-xl border border-neutral-200 bg-white">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
          <Plus size={16} /> Add stock item
        </summary>
        <div className="border-t border-neutral-100 p-4">
          <AddStockItemForm skus={skus.map((s) => ({ id: s.id, label: `${s.code} - ${s.name}`, tracked: s.trackedIndividually }))} />
        </div>
      </details>

      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2 text-xs text-neutral-500">
          <span>
            {total} stock item{total === 1 ? "" : "s"}
          </span>
          <span className="md:hidden">Swipe the table sideways for more columns</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-700">
              <tr>
                <th className={th}>Article ID</th>
                <th className={th}>SKU Code</th>
                <th className={th}>SKU Name</th>
                <th className={th}>Status</th>
                <th className={th}>Allocation</th>
                <th className={th}>Times used</th>
                <th className={th}>Hours used</th>
                <th className={th}>Tracked individually</th>
                <th className={th}>Quantity</th>
                <th className={th}>Current state</th>
                <th className={th}>Purchase date</th>
                <th className={th}>Purchase price</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="max-w-[9.5rem] truncate whitespace-nowrap px-4 py-3 font-mono text-xs" title={a.articleCode}>
                    {a.articleCode}
                  </td>
                  <td className={`${td} font-mono text-xs`}>{a.sku.code}</td>
                  <td className="max-w-[16rem] truncate px-4 py-3" title={a.sku.name}>
                    {a.sku.name}
                  </td>
                  <td className={td}>
                    <ArticleStatusSelect articleId={a.id} status={a.status} />
                  </td>
                  <td className={`${td} capitalize`}>{a.allocation.toLowerCase()}</td>
                  <td className={td}>{a.usageCount}</td>
                  <td className={td}>{Number(a.usageHours).toFixed(1)} h</td>
                  <td className={td}>{a.sku.trackedIndividually ? "Yes" : "No"}</td>
                  <td className={td}>{a.quantity}</td>
                  <td className={td}>{a.currentState === "IN" ? "In" : "Out"}</td>
                  <td className={td}>{formatDate(a.purchaseDate)}</td>
                  <td className={td}>{a.purchasePrice ? formatMoney(a.purchasePrice.toString(), a.purchaseCurrency ?? "TTD") : "-"}</td>
                  <td className={td}>{a._count.orderLines === 0 && <DeleteArticleButton articleId={a.id} />}</td>
                </tr>
              ))}
              {articles.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center text-neutral-400">
                    No stock items match. Import your TWICE CSV exports to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-4 py-3 text-sm text-neutral-600">
          <span>
            {from}&ndash;{to} of {total}
          </span>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="btn">
                Previous
              </Link>
            ) : (
              <span className="btn pointer-events-none opacity-40">Previous</span>
            )}
            <span className="px-1">
              {page} / {pages}
            </span>
            {page < pages ? (
              <Link href={pageHref(page + 1)} className="btn">
                Next
              </Link>
            ) : (
              <span className="btn pointer-events-none opacity-40">Next</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
