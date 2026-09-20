import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CalendarPlus, Clock, CreditCard, PackageCheck, ShieldAlert } from "lucide-react";
import { prisma } from "@thrice/db";
import { zonedDayBounds } from "@thrice/shared";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { getOpenOrderConflicts } from "@/lib/conflicts";
import { formatCardStamp } from "@/lib/format";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await getCurrentStore(user);
  if (!membership) redirect("/login");
  const { storeId, storeName } = membership;

  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { timezone: true } });
  const tz = store.timezone;
  const now = new Date();
  const { start: dayStart, end: dayEnd } = zonedDayBounds(tz, now);

  const include = { persons: true, bookings: { select: { quantity: true } } } as const;
  const [late, startingToday, returningToday, unpaidOpen, depositsToResolve, conflicts] = await Promise.all([
    prisma.order.findMany({ where: { storeId, status: "ACTIVE", endAt: { lt: now } }, include, orderBy: { endAt: "asc" }, take: 20 }),
    prisma.order.findMany({ where: { storeId, status: "UPCOMING", startAt: { gte: dayStart, lt: dayEnd } }, include, orderBy: { startAt: "asc" } }),
    prisma.order.findMany({ where: { storeId, status: "ACTIVE", endAt: { gte: now, lt: dayEnd } }, include, orderBy: { endAt: "asc" } }),
    prisma.order.count({ where: { storeId, status: { in: ["UPCOMING", "ACTIVE"] }, paymentStatus: "UNPAID" } }),
    prisma.orderDeposit.count({ where: { status: "HELD", order: { storeId, status: { in: ["COMPLETED", "CANCELLED"] } } } }),
    getOpenOrderConflicts(storeId),
  ]);

  const name = (o: { persons: { name: string; isLiableCustomer: boolean }[] }) =>
    (o.persons.find((p) => p.isLiableCustomer) ?? o.persons[0])?.name ?? "Unknown";
  const units = (o: { bookings: { quantity: number }[] }) => o.bookings.reduce((n, b) => n + b.quantity, 0);
  const unprepared = startingToday.filter((o) => !o.prepared).length;

  const stats = [
    { label: "Late returns", value: late.length, href: "/orders?tab=active", icon: Clock, alert: late.length > 0 },
    { label: "Stock conflicts", value: conflicts.size, href: "/orders?tab=upcoming&conflict=yes", icon: AlertTriangle, alert: conflicts.size > 0 },
    { label: "Deposits to resolve", value: depositsToResolve, href: "/orders?tab=completed", icon: ShieldAlert, alert: depositsToResolve > 0 },
    { label: "Unpaid open orders", value: unpaidOpen, href: "/orders?tab=upcoming", icon: CreditCard, alert: false },
  ];

  const list = (title: string, orders: typeof startingToday, stampKey: "startAt" | "endAt", empty: string) => (
    <section className="card">
      <h2 className="mb-3 flex items-center justify-between text-sm font-semibold">
        {title}
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-normal text-neutral-600">{orders.length}</span>
      </h2>
      {orders.length === 0 ? (
        <p className="text-sm text-neutral-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-neutral-50">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{name(o)}</span>
                  <span className="text-xs text-neutral-500">
                    #{o.orderNumber} &middot; {units(o)} item{units(o) === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-sm">
                  {stampKey === "startAt" && o.prepared && <span className="text-xs text-green-700">Prepared</span>}
                  <span className={stampKey === "endAt" && o.endAt < now ? "font-medium text-red-600" : ""}>
                    {formatCardStamp(o[stampKey], tz)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{storeName}</h1>
        <Link href="/orders/create" className="btn-primary flex items-center gap-2">
          <CalendarPlus size={16} /> Create order
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className={`card flex items-center gap-3 hover:shadow-md ${s.alert ? "border-amber-300 bg-amber-50" : ""}`}
          >
            <s.icon size={22} className={s.alert ? "text-amber-700" : "text-neutral-500"} />
            <span>
              <span className="block text-2xl font-semibold leading-none">{s.value}</span>
              <span className="text-xs text-neutral-600">{s.label}</span>
            </span>
          </Link>
        ))}
      </div>

      {unprepared > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-neutral-100 px-4 py-2 text-sm">
          <PackageCheck size={16} /> {unprepared} order{unprepared === 1 ? "" : "s"} starting today still need preparing.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {list("Starting today", startingToday, "startAt", "Nothing starts today.")}
        {list("Returning today", returningToday, "endAt", "No returns due for the rest of today.")}
      </div>

      {late.length > 0 && <div className="mt-4">{list("Late returns", late, "endAt", "")}</div>}
    </div>
  );
}
