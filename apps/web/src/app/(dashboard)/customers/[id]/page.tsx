import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@thrice/db";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { formatCardStamp, formatMoney } from "@/lib/format";
import { DeleteCustomerForm, EditCustomerForm } from "../customer-form";

const STATUS_LABEL: Record<string, string> = { UPCOMING: "Upcoming", ACTIVE: "Active", COMPLETED: "Completed", CANCELLED: "Cancelled" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await getCurrentStore(user);
  if (!membership) redirect("/login");
  // Customers and Catalog are for owners and admins only.
  if (membership.role === "STAFF") redirect("/");

  const { id } = await params;
  const [customer, store] = await Promise.all([
    prisma.customer.findFirst({
      where: { id, storeId: membership.storeId },
      include: {
        persons: {
          include: { order: { include: { bookings: { include: { product: true } } } } },
          orderBy: { order: { startAt: "desc" } },
        },
      },
    }),
    prisma.store.findUniqueOrThrow({ where: { id: membership.storeId }, select: { timezone: true } }),
  ]);
  if (!customer) notFound();

  const orders = customer.persons.map((p) => p.order);
  const paidTotal = orders
    .filter((o) => o.paymentStatus === "PAID" && o.status !== "CANCELLED")
    .reduce((n, o) => n + Number(o.totalPrice), 0);
  const unpaidOpen = orders.filter((o) => o.paymentStatus === "UNPAID" && (o.status === "UPCOMING" || o.status === "ACTIVE")).length;

  return (
    <div className="p-4 md:p-8">
      <Link href="/customers" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Customers
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">{customer.name}</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {orders.length} order{orders.length === 1 ? "" : "s"} &middot; {formatMoney(paidTotal.toString())} paid
        {unpaidOpen > 0 && <span className="text-red-600"> &middot; {unpaidOpen} unpaid open</span>}
      </p>

      <EditCustomerForm
        customerId={customer.id}
        values={{
          name: customer.name,
          email: customer.email ?? "",
          phone: customer.phone ?? "",
          company: customer.company ?? "",
          notes: customer.notes ?? "",
        }}
      />
      {orders.length === 0 && <DeleteCustomerForm customerId={customer.id} />}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Orders</h2>
      <div className="max-w-3xl space-y-2">
        {orders.map((o) => (
          <Link key={o.id} href={`/orders/${o.id}`} className="card flex items-center justify-between py-3 hover:bg-neutral-50">
            <span className="min-w-0">
              <span className="block text-xs text-neutral-500">
                #{o.orderNumber} &middot; {STATUS_LABEL[o.status]}
              </span>
              <span className="block truncate text-sm">{o.bookings.map((b) => b.product.name).join(", ")}</span>
            </span>
            <span className="shrink-0 text-right text-sm">
              <span className="block">{formatMoney(o.totalPrice.toString(), o.currency)}</span>
              <span className="text-xs text-neutral-500">{formatCardStamp(o.startAt, store.timezone)}</span>
            </span>
          </Link>
        ))}
        {orders.length === 0 && <p className="text-sm text-neutral-400">No orders yet.</p>}
      </div>
    </div>
  );
}
