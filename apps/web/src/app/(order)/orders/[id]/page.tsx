import { currencySymbol } from "@thrice/shared/currency";
import { notFound, redirect } from "next/navigation";
import { Check, ChevronDown, Mail, User } from "lucide-react";
import { prisma } from "@thrice/db";
import { enabledPaymentLabels, encodeCode128B, resolvePaymentMethods } from "@thrice/shared";
import { describeAuditAction } from "@/lib/audit-labels";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { getFreeArticlesForSku } from "@/lib/availability";
import { formatCardStamp, formatDateTime, formatDuration, formatItemStamp, formatMoney } from "@/lib/format";
import {
  setPreparedAction,
  setPaymentStatusAction,
  startOrderAction,
  endOrderAction,
  cancelOrderAction,
  updateBookingNotesAction,
  updateBookingPriceAction,
  removeBookingUnitAction,
  endPersonAction,
  cancelStartAction,
  reopenOrderAction,
} from "./actions";
import { PrintIconButton } from "./print-button";
import { ArticleSelect } from "./article-select";
import { AddProductForm } from "./add-product-form";
import { PersonToolbar } from "./person-toolbar";
import { DepositPanel } from "./deposit-panel";
import { getOpenOrderConflicts } from "@/lib/conflicts";
import { fulfillmentOf } from "@/lib/fulfillment";
import { AddPersonButton, DuplicateButton, EmailButton, PersonMenu, ReturnMethodSelect, StartDatePicker } from "./order-controls";
import { DiscountDialog } from "./discount-dialog";
import { NotesDialog, PaymentMethodDialog } from "./dialogs";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await getCurrentStore(user);
  if (!membership) redirect("/login");

  const { id } = await params;

  const [order, store] = await Promise.all([
    prisma.order.findFirst({
      where: { id, storeId: membership.storeId },
      include: {
        persons: true,
        deposit: true,
        bookings: {
          include: {
            product: true,
            variant: true,
            lines: { include: { sku: true, article: true }, orderBy: { createdAt: "asc" } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.store.findUniqueOrThrow({ where: { id: membership.storeId } }),
  ]);

  if (!order) notFound();
  const tz = store.timezone;

  const liablePerson = order.persons.find((p) => p.isLiableCustomer) ?? order.persons[0];
  const isLate = order.status === "ACTIVE" && order.endAt < new Date();
  const editable = order.status === "UPCOMING" || order.status === "ACTIVE";
  const totalUnits = order.bookings.reduce((s, b) => s + b.quantity, 0);
  const originalTotal = order.bookings.reduce((s, b) => s + b.quantity * Number(b.priceEach), 0);

  // Serial options per line, scoped to that line's own window: only units actually free.
  const articleOptionsByLine = new Map<string, { id: string; articleCode: string }[]>();
  for (const b of order.bookings) {
    const from = b.startAt ?? order.startAt;
    const to = b.endAt ?? order.endAt;
    for (const l of b.lines) {
      if (!l.sku.trackedIndividually) continue;
      articleOptionsByLine.set(l.id, await getFreeArticlesForSku(membership.storeId, l.skuId, from, to, l.id));
    }
  }

  const variants = await prisma.productVariant.findMany({
    where: { storeId: membership.storeId },
    include: { product: true },
    orderBy: { product: { name: "asc" } },
    take: 1000,
  });
  const variantOptions = variants.map((v) => ({
    id: v.id,
    label: v.name === "Default" ? v.product.name : `${v.product.name} — ${v.name}`,
  }));

  const customers = await prisma.customer.findMany({
    where: { storeId: membership.storeId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const conflicts =
    order.status === "UPCOMING" || order.status === "ACTIVE"
      ? ((await getOpenOrderConflicts(membership.storeId)).get(order.id) ?? [])
      : [];
  const paymentMethods = resolvePaymentMethods(store.paymentMethodConfig);

  const activity = await prisma.auditLog.findMany({
    where: { storeId: membership.storeId, entityType: "Order", entityId: order.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { name: true } } },
  });

  // One card per person; items without an owner belong to the liable customer.
  const liableId = liablePerson?.id ?? null;
  const bookingsByPerson = new Map<string, typeof order.bookings>();
  for (const p of order.persons) bookingsByPerson.set(p.id, []);
  for (const b of order.bookings) {
    const key = b.personId ?? liableId;
    if (key) bookingsByPerson.set(key, [...(bookingsByPerson.get(key) ?? []), b]);
  }
  const fulfillment = fulfillmentOf(
    order.status,
    order.persons.filter((p) => (bookingsByPerson.get(p.id) ?? []).length > 0)
  );
  const startLabel = order.startAt.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });

  const barcode = encodeCode128B(String(order.orderNumber));
  const currencyLabel = currencySymbol(order.currency).trim();
  const statusLabel = order.status === "UPCOMING" ? "Booked" : order.status === "ACTIVE" ? "In progress" : order.status;

  return (
    <div className="h-full">
      {/* ---------- Screen (editable) view ---------- */}
      <div className="grid grid-cols-1 lg:h-full lg:grid-cols-[1fr_320px] print:hidden">
        {/* ---- Left: person cards, scrolls on its own ---- */}
        <div className="bg-neutral-50 p-4 lg:min-h-0 lg:overflow-y-auto">
          {conflicts.length > 0 && (
            <div role="alert" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Stock conflict{conflicts.length === 1 ? "" : "s"} on this order</p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {conflicts.map((c) => (
                  <li key={c.message}>{c.message}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600">
              <Check size={12} /> Saved
            </span>
            <div className="flex items-center gap-2 text-sm">
              {order.persons.map((p) => (
                <span key={p.id} className="flex items-center gap-1 font-medium text-neutral-700">
                  <User size={14} />
                  {p.name.length > 12 ? p.name.slice(0, 12) : p.name}
                </span>
              ))}
              {editable && <AddPersonButton orderId={order.id} customers={customers} />}
            </div>
          </div>

          {Array.from(bookingsByPerson.entries()).map(([personId, bookings]) => {
            const person = order.persons.find((p) => p.id === personId) ?? liablePerson;
            const subtotal = bookings.reduce((s, b) => s + b.quantity * Number(b.priceEach), 0);

            const editPanel = (
              <div className="space-y-4">
                <p className="text-xs text-neutral-500">Change the price, add a note, or remove a unit.</p>
                {bookings.map((b) => (
                  <div key={b.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {b.product.name}
                        {b.quantity > 1 && <span className="text-neutral-400"> &times; {b.quantity}</span>}
                      </p>
                      <form action={updateBookingPriceAction.bind(null, order.id, b.id)} className="flex items-center gap-1">
                        <span className="text-xs text-neutral-400">{currencyLabel} each</span>
                        <input
                          key={b.priceEach.toString()}
                          name="priceEach"
                          type="number"
                          min={0}
                          step="0.01"
                          defaultValue={b.priceEach.toString()}
                          className="input w-28 min-w-0 py-1 text-right text-sm"
                        />
                        <button type="submit" className="btn py-1 text-xs">
                          Save
                        </button>
                      </form>
                    </div>
                    <form action={updateBookingNotesAction.bind(null, order.id, b.id)} className="mt-2 flex gap-2">
                      <input
                        key={b.notes ?? ""}
                        name="notes"
                        defaultValue={b.notes ?? ""}
                        placeholder="Note for this booking..."
                        className="input flex-1 py-1 text-xs"
                      />
                      <button type="submit" className="btn py-1 text-xs">
                        Save
                      </button>
                    </form>
                    {editable && totalUnits > 1 && (
                      <form action={removeBookingUnitAction.bind(null, order.id, b.id)} className="mt-2">
                        <button type="submit" className="rounded bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-dark">
                          Delete {b.quantity > 1 ? "one unit" : "item"}
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            );

            return (
              <section key={personId ?? "unassigned"} className="mb-4 overflow-hidden rounded-xl border-2 border-brand bg-white">
                <div className="grid md:grid-cols-[220px_1fr]">
                  {/* Person column */}
                  <div className="border-b border-neutral-200 p-5 md:border-b-0 md:border-r">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h2 className="text-xl font-semibold">{person?.name ?? "Unassigned"}</h2>
                        {order.status === "ACTIVE" && person && !person.endedAt && (
                          <form action={endPersonAction.bind(null, order.id, person.id)}>
                            <button type="submit" title="End order" className="flex items-center gap-2 text-sm">
                              <span className="relative h-5 w-9 rounded-full bg-neutral-300">
                                <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow" />
                              </span>
                              End order
                            </button>
                          </form>
                        )}
                        {(order.status === "COMPLETED" || Boolean(person?.endedAt)) && (
                          <span className="flex items-center gap-2 text-sm text-neutral-500">
                            <span className="relative h-5 w-9 rounded-full bg-neutral-400">
                              <span className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow" />
                            </span>
                            Ended
                          </span>
                        )}
                      </div>
                      {person && (
                        <PersonMenu
                          orderId={order.id}
                          personId={person.id}
                          isLiable={person.id === liableId}
                          canRemove={bookings.length === 0 && order.persons.length > 1}
                          disabled={!editable}
                        />
                      )}
                    </div>
                    <div className="mt-4 flex gap-4 text-sm">
                      <p className="text-neutral-700">{formatDuration(order.startAt, order.endAt)}</p>
                      <p className={`font-medium ${isLate ? "text-red-600" : ""}`}>
                        {formatCardStamp(order.startAt, tz)} -<br />
                        {formatCardStamp(order.endAt, tz)}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center gap-1 text-neutral-600">
                      <NotesDialog orderId={order.id} notes={order.notes} />
                      <DiscountDialog orderId={order.id} original={originalTotal} currentPercent={order.discountPercent ? Number(order.discountPercent) : null} currency={currencyLabel} />
                    </div>
                  </div>

                  {/* Items column */}
                  <div>
                    <PersonToolbar
                      subtotal={`${currencyLabel} ${subtotal.toFixed(2)}`}
                      disabled={!editable}
                      addPanel={
                        <AddProductForm
                          orderId={order.id}
                          variants={variantOptions}
                          persons={order.persons.map((p) => ({ id: p.id, name: p.name }))}
                          defaultPersonId={person?.id}
                          from={order.startAt.toISOString()}
                          to={order.endAt.toISOString()}
                          currency={currencyLabel}
                        />
                      }
                      editPanel={editPanel}
                    />
                    <div className="bg-neutral-100 px-3 py-1 text-xs text-neutral-600">{statusLabel}</div>

                    <ul>
                      {bookings.flatMap((b) => {
                        // One row per unit, like TWICE. Tracked lines hand out one serial per unit.
                        const tracked = b.lines.filter((l) => l.sku.trackedIndividually);
                        const perUnit = b.quantity > 0 ? Math.floor(tracked.length / b.quantity) : 0;
                        const from = b.startAt ?? order.startAt;
                        const to = b.endAt ?? order.endAt;
                        return Array.from({ length: b.quantity }, (_, i) => {
                          const serials = perUnit > 0 ? tracked.slice(i * perUnit, (i + 1) * perUnit) : i === 0 ? tracked : [];
                          return (
                            <li
                              key={`${b.id}-${i}`}
                              className="flex items-start justify-between gap-4 border-b border-l-4 border-neutral-100 border-l-transparent px-4 py-3 hover:border-l-brand hover:bg-brand-light/60"
                            >
                              <div className="min-w-0">
                                <p className="text-base leading-snug">{b.product.name}</p>
                                <p className="mt-1 text-[11px] text-neutral-500">
                                  {formatItemStamp(from, tz)} - {formatItemStamp(to, tz)}
                                </p>
                                <p className="text-[11px] text-neutral-500">({formatDuration(from, to)})</p>
                              </div>
                              {(serials.length > 0 || person?.endedAt) && (
                                <div className="w-44 shrink-0 space-y-1">
                                  {serials.map((l) => (
                                    <div key={l.id}>
                                      <span className="text-[10px] text-neutral-500">ID</span>
                                      <ArticleSelect
                                        orderId={order.id}
                                        lineId={l.id}
                                        currentArticleId={l.articleId}
                                        options={articleOptionsByLine.get(l.id) ?? []}
                                      />
                                    </div>
                                  ))}
                                  {person?.endedAt && (
                                    <p className="text-[11px] text-neutral-500">
                                      Returned {formatCardStamp(person.endedAt, tz).split(" ").slice(1).join(" ")}
                                    </p>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        });
                      })}
                    </ul>
                    {bookings.length === 0 && (
                      <p className="px-4 py-6 text-sm text-neutral-400">No items yet. Use &ldquo;Add products&rdquo;.</p>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
          {order.bookings.length === 0 && <p className="text-sm text-neutral-400">No products booked yet.</p>}
        </div>

        {/* ---- Right: fixed details panel ---- */}
        <aside className="flex flex-col border-t border-neutral-200 bg-white lg:min-h-0 lg:border-l lg:border-t-0">
          <div className="p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <div className="flex items-center gap-1">
              <PrintIconButton />
              <EmailButton orderId={order.id} />
              <DiscountDialog orderId={order.id} original={originalTotal} currentPercent={order.discountPercent ? Number(order.discountPercent) : null} currency={currencyLabel} />
              <NotesDialog orderId={order.id} notes={order.notes} />
            </div>

            <dl className="mt-4 space-y-0.5 text-[11px] text-neutral-500">
              <div className="flex justify-between">
                <dt>Order number</dt>
                <dd className="text-neutral-700">{order.orderNumber}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Created</dt>
                <dd className="text-neutral-700">{formatDateTime(order.createdAt, tz)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Channel</dt>
                <dd className="capitalize text-neutral-700">{order.channel.toLowerCase()}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Fulfillment</dt>
                <dd className="text-neutral-700">{fulfillment}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Type</dt>
                <dd className="capitalize text-neutral-700">{order.type.toLowerCase()}</dd>
              </div>
            </dl>

            <p className="mt-1 flex items-center justify-between text-2xl font-semibold">
              {liablePerson?.name ?? "No customer"}
              <ChevronDown size={16} className="text-neutral-500" />
            </p>
            {liablePerson?.email && <p className="text-xs text-neutral-500">{liablePerson.email}</p>}

            <StartDatePicker
              orderId={order.id}
              startISO={order.startAt.toISOString()}
              label={startLabel}
              disabled={order.status !== "UPCOMING"}
            />
            <ReturnMethodSelect
              orderId={order.id}
              value={order.returnMethod}
              disabled={order.status === "COMPLETED" || order.status === "CANCELLED"}
            />

            {isLate && (
              <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm font-medium text-red-700">Late return</p>
            )}

            <p className="mt-5 border-b border-neutral-200 pb-2 text-center text-[11px] text-neutral-600">Order summary</p>
            <div className="flex items-center justify-between py-3">
              <span className="flex items-center gap-2 text-lg">
                <span className={`h-2.5 w-2.5 rounded-full ${order.paymentStatus === "PAID" ? "bg-green-500" : "bg-red-500"}`} />
                {order.paymentStatus === "PAID" ? "Paid" : "Unpaid"}
              </span>
              <PaymentMethodDialog orderId={order.id} method={order.paymentMethod} reference={order.paymentReference} methods={paymentMethods} />
            </div>
            {order.paymentReference && <p className="-mt-1 pb-1 text-right text-[11px] text-neutral-500">Ref: {order.paymentReference}</p>}
            {order.discountPercent && (
              <div className="flex justify-between text-xs text-neutral-500">
                <span>Discount</span>
                <span>{order.discountPercent.toString()}%</span>
              </div>
            )}
            <div className="flex justify-between border-b border-neutral-200 pb-3 text-xs">
              <span className="text-neutral-500">Total</span>
              <span className="font-medium">{formatMoney(order.totalPrice.toString(), order.currency)}</span>
            </div>

            <form action={setPaymentStatusAction.bind(null, order.id, order.paymentStatus === "PAID" ? "UNPAID" : "PAID")} className="mt-3 text-center">
              {order.paymentStatus === "PAID" ? (
                <button type="submit" className="text-xs text-neutral-500 underline hover:text-red-600">
                  Mark as unpaid
                </button>
              ) : (
                <button type="submit" className="w-full rounded-md bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark">
                  Mark as paid
                </button>
              )}
            </form>

            <p className="mt-4 border-b border-neutral-200 pb-2 text-center text-[11px] text-neutral-600">Payment summary</p>
            <DepositPanel
              orderId={order.id}
              currency={currencyLabel}
              closed={order.status === "COMPLETED" || order.status === "CANCELLED"}
              enabledMethods={enabledPaymentLabels(paymentMethods).map((label) => ({ key: label, label }))}
              deposit={
                order.deposit
                  ? {
                      amount: Number(order.deposit.amount),
                      status: order.deposit.status,
                      method: order.deposit.method,
                      capturedAmount: order.deposit.capturedAmount === null ? null : Number(order.deposit.capturedAmount),
                      note: order.deposit.note,
                    }
                  : null
              }
            />

            <form action={setPreparedAction.bind(null, order.id, !order.prepared)} className="py-4">
              <button type="submit" role="checkbox" aria-checked={order.prepared} className="flex items-center gap-2 text-sm">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded border ${
                    order.prepared ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-400"
                  }`}
                >
                  {order.prepared && <Check size={14} />}
                </span>
                Mark as prepared
              </button>
            </form>


            <details className="mt-4 border-t border-neutral-200 pt-3">
              <summary className="cursor-pointer text-[11px] font-medium text-neutral-600">Activity ({activity.length})</summary>
              <ul className="mt-2 space-y-2">
                {activity.map((a) => (
                  <li key={a.id} className="text-[11px] leading-tight">
                    <p className="text-neutral-800">{describeAuditAction(a.action, a.diff)}</p>
                    <p className="text-neutral-500">
                      {a.user?.name ?? "System"} &middot; {formatDateTime(a.createdAt, tz)}
                    </p>
                  </li>
                ))}
                {activity.length === 0 && <li className="text-[11px] text-neutral-400">No activity yet.</li>}
              </ul>
            </details>
          </div>

          {/* Primary actions pinned to the bottom, like TWICE */}
          <div className="space-y-2 p-4">
            {order.status === "COMPLETED" && (
              <>
                <p className="text-xs text-neutral-500">Rental ended: {formatDateTime(order.endedAt ?? order.endAt, tz)}</p>
                {order.deposit?.status === "HELD" && (
                  <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">The security deposit is still held. Release it or keep some of it.</p>
                )}
                <DuplicateButton orderId={order.id} />
                <form action={reopenOrderAction.bind(null, order.id)} className="text-center">
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    Re-open order
                  </button>
                </form>
              </>
            )}
            {order.status === "CANCELLED" && (
              <>
                <p className="text-xs text-neutral-500">Order cancelled</p>
                <DuplicateButton orderId={order.id} />
              </>
            )}
            {order.status === "UPCOMING" && (
              <>
                <form action={startOrderAction.bind(null, order.id)}>
                  <button type="submit" className="w-full rounded-md bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700">
                    Start
                  </button>
                </form>
                <form action={cancelOrderAction.bind(null, order.id)} className="text-center">
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    Cancel order
                  </button>
                </form>
              </>
            )}
            {order.status === "ACTIVE" && (
              <>
                <form action={endOrderAction.bind(null, order.id)}>
                  <button type="submit" className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">
                    End order
                  </button>
                </form>
                <form action={cancelStartAction.bind(null, order.id)} className="text-center">
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    Cancel start
                  </button>
                </form>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* ---------- Print-only invoice ---------- */}
      <div className="hidden p-8 print:block">
        <p className="mb-6 text-lg font-bold italic">{store.name}</p>
        <h1 className="mb-4 text-center text-lg font-bold">Order confirmation</h1>
        <div className="mb-4 text-center text-sm">
          <p>
            {store.name}
            {store.tagline ? ` - ${store.tagline}` : ""}
          </p>
          {store.address && <p>{store.address}</p>}
          {store.phone && <p>{store.phone}</p>}
          {store.email && <p>{store.email}</p>}
        </div>
        <hr className="mb-4 border-neutral-400" />

        <p className="mb-1 text-sm font-bold">Contact information</p>
        <p className="text-sm">{liablePerson?.name}</p>
        {liablePerson?.email && <p className="text-sm">{liablePerson.email}</p>}
        {liablePerson?.phone && <p className="text-sm">{liablePerson.phone}</p>}
        <hr className="mb-4 mt-4 border-neutral-400" />

        {Array.from(bookingsByPerson.entries()).filter(([, items]) => items.length > 0).map(([personId, bookings]) => {
          const person = order.persons.find((p) => p.id === personId) ?? liablePerson;
          return (
            <div key={personId ?? "unassigned"} className="mb-4">
              <p className="mb-2 text-sm font-bold">{person?.name ?? "Unassigned"}</p>
              {bookings.map((b) => {
                const serials = b.lines
                  .map((l) => l.article?.articleCode)
                  .filter((code): code is string => Boolean(code));
                return (
                  <div key={b.id} className="mb-2">
                    <div className="flex items-baseline justify-between text-sm">
                      <span>
                        {b.product.name}
                        {serials.length > 0 && `(${serials.join("/")})`}
                      </span>
                      <span>{formatMoney((b.quantity * Number(b.priceEach)).toString(), order.currency)}</span>
                    </div>
                    <p className="text-xs text-neutral-500">
                      {formatDateTime(b.startAt ?? order.startAt, tz)} - {formatDateTime(b.endAt ?? order.endAt, tz)}
                    </p>
                    {b.notes && <p className="text-xs text-neutral-500">Note: {b.notes}</p>}
                  </div>
                );
              })}
            </div>
          );
        })}

        <hr className="mb-2 border-neutral-400" />
        <div className="flex justify-between text-sm font-bold">
          <span>Total</span>
          <span>{formatMoney(order.totalPrice.toString(), order.currency)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>{order.paymentStatus === "PAID" ? "Paid" : "Unpaid"}</span>
          <span>
            {order.paymentStatus === "PAID" ? formatMoney(order.totalPrice.toString(), order.currency) : formatMoney("0", order.currency)}
          </span>
        </div>

        <div className="mt-10 flex flex-col items-center gap-1">
          <svg
            role="img"
            aria-label={`Barcode for order ${order.orderNumber}`}
            viewBox={`-10 0 ${barcode.modules + 20} 40`}
            preserveAspectRatio="none"
            className="h-12 w-64"
          >
            {barcode.bars.map(([x, w]) => (
              <rect key={x} x={x} y={0} width={w} height={40} fill="#000" />
            ))}
          </svg>
          <p className="text-sm">#{order.orderNumber}</p>
        </div>
      </div>
    </div>
  );
}
