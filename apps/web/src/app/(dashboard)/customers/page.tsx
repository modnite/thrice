import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, type Prisma } from "@thrice/db";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { NewCustomerForm } from "./customer-form";

const PAGE_SIZE = 50;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; new?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await getCurrentStore(user);
  if (!membership) redirect("/login");
  // Customers and Catalog are for owners and admins only.
  if (membership.role === "STAFF") redirect("/");

  const { q, page: pageRaw, new: showNew } = await searchParams;
  const page = Math.max(1, Number(pageRaw) || 1);

  const where: Prisma.CustomerWhereInput = {
    storeId: membership.storeId,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { _count: { select: { persons: true } } },
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.customer.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => `/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) }).toString()}`;

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Customers</h1>
        <Link href="/customers?new=1" className="btn-primary">
          New customer
        </Link>
      </div>

      {showNew && (
        <div className="mb-6">
          <NewCustomerForm />
        </div>
      )}

      <form className="mb-4 flex gap-3">
        <input name="q" defaultValue={q} placeholder="Search name, email, phone or company" className="input max-w-md" />
        <button type="submit" className="btn">
          Search
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-700">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Orders</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600">{c.company ?? "-"}</td>
                <td className="px-4 py-3 text-neutral-600">{c.email ?? "-"}</td>
                <td className="px-4 py-3 text-neutral-600">{c.phone ?? "-"}</td>
                <td className="px-4 py-3">{c._count.persons}</td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-neutral-400">
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
        <span>
          {total} customer{total === 1 ? "" : "s"}
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
