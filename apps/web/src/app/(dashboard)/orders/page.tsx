import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Check, Download } from "lucide-react";
import { prisma } from "@thrice/db";
import { DATE_PRESET_KEYS, DATE_PRESET_LABELS } from "@thrice/shared";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { formatCardStamp, formatDateTime, formatMoney } from "@/lib/format";
import { buildOrderBy, buildOrdersWhere, ORDER_TYPES, SORT_COLUMNS, type Tab } from "@/lib/order-filters";
import { getOpenOrderConflicts, type Conflict } from "@/lib/conflicts";
import { ColumnsPicker } from "./columns-picker";
import { CompletedTable } from "./completed-table";
import { FilterBuilder } from "./filter-builder";
import { FiltersForm, Pill } from "./filters-form";
import { ProductPill } from "./product-pill";

const TYPE_LABELS: Record<(typeof ORDER_TYPES)[number], string> = {
  BOOKING: "Booking",
  SALE: "Sale",
  SUBSCRIPTION: "Subscription",
  BUYBACK: "Buyback",
};

const COLUMNS = [
  { key: "number", label: "#" },
  { key: "completed", label: "Completed" },
  { key: "customer", label: "Customer" },
  { key: "products", label: "Products" },
  { key: "status", label: "Status" },
  { key: "payment", label: "Payment" },
  { key: "price", label: "Price" },
  { key: "type", label: "Type" },
  { key: "created", label: "Created" },
  { key: "start", label: "Start" },
  { key: "end", label: "End" },
] as const;
const DEFAULT_COLS = ["number", "completed", "customer", "products", "status", "payment", "price"];

const PAGE_SIZE = 100;

type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await getCurrentStore(user);
  if (!membership) redirect("/login");

  const sp = await searchParams;
  const tabRaw = one(sp.tab);
  const tab: Tab = tabRaw === "active" || tabRaw === "completed" ? tabRaw : "upcoming";
  const q = one(sp.q);
  const range = one(sp.range);
  const delivery = one(sp.delivery);
  const prepared = one(sp.prepared);
  const payment = one(sp.payment);
  const typeRaw = one(sp.type);
  const product = one(sp.product);
  const returnMethod = one(sp.return);
  const colsRaw = one(sp.cols);
  const sort = one(sp.sort);
  const dir = one(sp.dir);
  const filters = ([] as string[]).concat(sp.f ?? []);
  const type = ORDER_TYPES.find((t) => t === typeRaw);
  const visibleKeys = colsRaw ? colsRaw.split(",").filter((k) => COLUMNS.some((c) => c.key === k)) : DEFAULT_COLS;
  const limit = Math.min(Math.max(Number(one(sp.limit)) || PAGE_SIZE, PAGE_SIZE), 2000);

  const store = await prisma.store.findUniqueOrThrow({
    where: { id: membership.storeId },
    select: { timezone: true },
  });
  const tz = store.timezone;

  const conflictMap: Map<string, Conflict[]> = tab === "completed" ? new Map() : await getOpenOrderConflicts(membership.storeId);
  const onlyConflicts = tab !== "completed" && one(sp.conflict) === "yes";

  const baseWhere = buildOrdersWhere(
    membership.storeId,
    tab,
    { q, range, delivery, prepared, payment, type, product, return: returnMethod, f: filters },
    tz
  );
  const where = onlyConflicts ? { AND: [baseWhere, { id: { in: [...conflictMap.keys()] } }] } : baseWhere;

  const [upcomingCount, activeCount, orders, products] = await Promise.all([
    prisma.order.count({ where: { storeId: membership.storeId, status: "UPCOMING" } }),
    prisma.order.count({ where: { storeId: membership.storeId, status: "ACTIVE" } }),
    prisma.order.findMany({
      where,
      include: { persons: true, bookings: { include: { product: true } } },
      orderBy: buildOrderBy(tab, sort, dir),
      take: limit,
    }),
    prisma.product.findMany({
      where: { storeId: membership.storeId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const limited = orders.length >= limit;
  const now = new Date();

  const liableName = (o: (typeof orders)[number]) =>
    (o.persons.find((p) => p.isLiableCustomer) ?? o.persons[0])?.name ?? "Unknown";

  // "19.09." group headings, in the store's timezone.
  const groupLabel = (d: Date) => {
    const day = d.toLocaleDateString("en-GB", { day: "2-digit", timeZone: tz });
    const month = d.toLocaleDateString("en-GB", { month: "2-digit", timeZone: tz });
    return `${day}.${month}.`;
  };

  const groups: { label: string; orders: typeof orders }[] = [];
  if (tab !== "completed") {
    for (const o of orders) {
      const label = groupLabel(tab === "upcoming" ? o.startAt : o.endAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.orders.push(o);
      else groups.push({ label, orders: [o] });
    }
  }

  const rangeOptions = DATE_PRESET_KEYS.map((key) => ({ value: key, label: DATE_PRESET_LABELS[key] }));
  const paymentOptions = [
    { value: "paid", label: "Paid" },
    { value: "unpaid", label: "Unpaid" },
  ];
  const typeOptions = ORDER_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }));

  function renderCell(key: (typeof COLUMNS)[number]["key"], o: (typeof orders)[number]) {
    switch (key) {
      case "number":
        return (
          <Link href={`/orders/${o.id}`} className="hover:underline">
            {o.orderNumber}
          </Link>
        );
      case "completed":
        return formatCardStamp(o.endedAt ?? o.endAt, tz).split(",")[0];
      case "customer":
        return liableName(o);
      case "products":
        return (
          <span className="block max-w-xs truncate">
            {o.bookings.slice(0, 2).map((b) => b.product.name).join(", ")}
            {o.bookings.length > 2 && (
              <span className="ml-1 rounded-full bg-neutral-100 px-1.5 text-xs">+{o.bookings.length - 2}</span>
            )}
          </span>
        );
      case "status":
        return (
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium text-white">
            {o.status === "CANCELLED" ? "Cancelled" : "Completed"}
          </span>
        );
      case "payment":
        return (
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${o.paymentStatus === "PAID" ? "bg-green-500" : "bg-red-500"}`} />
            {o.paymentStatus === "PAID" ? "Paid" : "Unpaid"}
          </span>
        );
      case "price":
        return formatMoney(o.totalPrice.toString(), o.currency);
      case "type":
        return TYPE_LABELS[o.type];
      case "created":
        return formatDateTime(o.createdAt, tz);
      case "start":
        return formatDateTime(o.startAt, tz);
      case "end":
        return formatDateTime(o.endAt, tz);
    }
  }

  const Badge = ({ n }: { n: number }) =>
    n > 0 ? <span className="ml-2 rounded-full bg-brand px-1.5 py-0.5 text-xs text-white">{n}</span> : null;

  // Same filters as the list on screen, so "Export active" matches what you're looking at.
  const exportHref = (t: Tab) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (["tab", "limit", "cols", "conflict"].includes(k) || v === undefined) continue;
      for (const item of ([] as string[]).concat(v)) next.append(k, item);
    }
    next.set("tab", t);
    return `/orders/export?${next.toString()}`;
  };

  const loadMoreHref = () => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "limit" || v === undefined) continue;
      for (const item of ([] as string[]).concat(v)) next.append(k, item);
    }
    next.set("tab", "completed");
    next.set("limit", String(limit + PAGE_SIZE));
    return `/orders?${next.toString()}`;
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <div className="flex flex-wrap items-center gap-2">
          {membership.role !== "STAFF" && (
            <Link href="/orders/import" className="btn">
              Import orders
            </Link>
          )}
          {tab !== "completed" && (
            <a href={exportHref(tab)} className="btn flex items-center gap-2" download>
              <Download size={14} /> Export {tab}
            </a>
          )}
          <a href="/orders/export?tab=all" className="btn flex items-center gap-2" download>
            <Download size={14} /> Export all rentals
          </a>
        </div>
      </div>

      <div className="mb-6 flex gap-6 border-b border-neutral-200">
        <Link href="/orders?tab=upcoming" className={`tab ${tab === "upcoming" ? "tab-active" : ""}`}>
          Upcoming <Badge n={upcomingCount} />
        </Link>
        <Link href="/orders?tab=active" className={`tab ${tab === "active" ? "tab-active" : ""}`}>
          Active <Badge n={activeCount} />
        </Link>
        <Link href="/orders?tab=completed" className={`tab ${tab === "completed" ? "tab-active" : ""}`}>
          Completed
        </Link>
      </div>

      <FiltersForm tab={tab} q={q}>
        {tab === "upcoming" && (
          <Pill
            name="prepared"
            defaultValue={prepared}
            label="Status"
            options={[
              { value: "yes", label: "Prepared" },
              { value: "no", label: "Unprepared" },
            ]}
          />
        )}
        {tab === "upcoming" && <Pill name="range" defaultValue={range} label="Start date" options={rangeOptions} />}
        <ProductPill products={products} selectedId={product} />
        {tab !== "upcoming" && <Pill name="payment" defaultValue={payment} label="Payment" options={paymentOptions} />}
        {tab !== "upcoming" && <Pill name="type" defaultValue={type} label="Type" options={typeOptions} />}
        {tab === "active" && (
          <Pill
            name="return"
            defaultValue={returnMethod}
            label="Return"
            options={[
              { value: "STORE", label: "Return to store" },
              { value: "PICKUP", label: "Pickup" },
            ]}
          />
        )}
        {tab !== "upcoming" && (
          <Pill name="range" defaultValue={range} label={tab === "active" ? "Return date" : "End date"} options={rangeOptions} />
        )}
        {tab !== "completed" && (
          <Pill name="conflict" defaultValue={one(sp.conflict)} label="Conflicts" options={[{ value: "yes", label: "Has conflicts" }]} />
        )}
        {tab === "upcoming" && (
          <Pill
            name="delivery"
            defaultValue={delivery}
            label="Delivery"
            options={[
              { value: "yes", label: "Delivery: Yes" },
              { value: "no", label: "Delivery: No" },
            ]}
          />
        )}
        {colsRaw && <input type="hidden" name="cols" value={colsRaw} />}
        {sort && <input type="hidden" name="sort" value={sort} />}
        {dir && <input type="hidden" name="dir" value={dir} />}
        {filters.map((f) => (
          <input key={f} type="hidden" name="f" value={f} />
        ))}
      </FiltersForm>

      {tab !== "completed" ? (
        <div>
          {groups.map((g) => (
            <section key={g.label} className="mb-6">
              <h2 className="mb-3 text-lg font-medium">{g.label}</h2>
              <div className="space-y-3">
                {g.orders.map((o) => {
                  const showReady = tab === "upcoming" && (o.prepared || o.startAt <= now);
                  const late = tab === "active" && o.endAt < now;
                  const conflicts = conflictMap.get(o.id) ?? [];
                  return (
                    <Link
                      key={o.id}
                      href={`/orders/${o.id}`}
                      className={`relative flex min-h-[110px] flex-col gap-2 rounded-lg border-l-4 bg-white p-4 pb-12 shadow-sm hover:shadow-md md:flex-row md:gap-6 md:pb-4 ${
                        tab === "upcoming" && o.prepared ? "border-green-500" : "border-transparent"
                      }`}
                    >
                      <div className="min-w-0 md:w-1/3">
                        <p className="text-[11px] text-neutral-500">#{o.orderNumber}</p>
                        <p className="truncate text-xl font-semibold">{liableName(o)}</p>
                        <p className="text-xs text-neutral-500">
                          {o.persons.length} {o.persons.length === 1 ? "person" : "persons"}
                        </p>
                        {showReady && <p className="mt-3 text-sm font-medium">Ready to start</p>}
                        {late && <p className="mt-3 text-sm font-medium text-red-600">Late return</p>}
                        {o.channel === "ONLINE" && <p className="text-xs text-neutral-500">Via online store</p>}
                        {conflicts.length > 0 && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700" title={conflicts.map((c) => c.message).join("\n")}>
                            <AlertTriangle size={12} /> Stock conflict
                          </p>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="text-neutral-600">
                          {o.bookings.length} {o.bookings.length === 1 ? "product" : "products"}
                        </p>
                        {o.bookings.slice(0, 3).map((b) => (
                          <p key={b.id} className="truncate text-xs text-neutral-800">
                            {b.product.name}
                          </p>
                        ))}
                        {o.bookings.length > 3 && <p className="text-xs text-neutral-500">+{o.bookings.length - 3} more</p>}
                      </div>
                      <div className="shrink-0 text-sm md:w-44 md:text-right">
                        <p className="text-xs text-neutral-500">{tab === "upcoming" ? "Order start" : "Next return time:"}</p>
                        <p className={`font-medium ${late ? "text-red-600" : ""}`}>
                          {formatCardStamp(tab === "upcoming" ? o.startAt : o.endAt, tz)}
                        </p>
                      </div>
                      <div className="absolute bottom-0 right-0 flex overflow-hidden rounded-tl-md text-xs">
                        {tab === "upcoming" && o.prepared && (
                          <span className="flex items-center gap-1 bg-neutral-100 px-3 py-1.5">
                            <Check size={12} /> Prepared
                          </span>
                        )}
                        <span className="flex items-center gap-2 bg-neutral-100 px-3 py-1.5">
                          <span className={`h-2 w-2 rounded-full ${o.paymentStatus === "PAID" ? "bg-green-500" : "bg-red-500"}`} />
                          {o.paymentStatus === "PAID" ? "Paid" : "Unpaid"}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
          {orders.length === 0 && <p className="text-center text-neutral-400">No {tab} orders.</p>}
        </div>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap items-start gap-3">
            <ColumnsPicker columns={COLUMNS.map((c) => ({ key: c.key, label: c.label }))} visible={visibleKeys} />
            <FilterBuilder />
          </div>
          {limited && (
            <div className="mb-3 flex items-center justify-between rounded-lg bg-brand-light px-4 py-3 text-sm">
              <div>
                <p className="font-medium">Results limited</p>
                <p className="text-neutral-600">Showing first {orders.length} results</p>
              </div>
              <Link href={loadMoreHref()} className="btn">
                Load more
              </Link>
            </div>
          )}
          <CompletedTable
            columns={COLUMNS.filter((c) => visibleKeys.includes(c.key)).map((c) => ({
              key: c.key,
              label: c.label,
              sortable: c.key in SORT_COLUMNS,
            }))}
            rows={orders.map((o) => ({
              id: o.id,
              cells: Object.fromEntries(COLUMNS.map((c) => [c.key, renderCell(c.key, o)])),
            }))}
          />
        </div>
      )}
    </div>
  );
}
