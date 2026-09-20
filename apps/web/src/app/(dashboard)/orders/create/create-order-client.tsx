"use client";

import { QtyStepper } from "@/components/qty-stepper";
import { useActionState, useEffect, useMemo, useState } from "react";
import { DURATION_PRESETS, isWithinOpeningHours, type HolidaysConfig, type OpeningHours } from "@thrice/shared/store-hours";
import { createOrderAction, type CreateOrderState } from "./actions";
import { useCurrencySymbol } from "@/components/currency";

type Variant = { id: string; name: string; skuLabel: string; isSimple: boolean };
type Product = { id: string; name: string; priceFrom: number; categoryIds: string[]; variants: Variant[] };
type Category = { id: string; name: string };
type Customer = { id: string; name: string; email: string | null };

type CartLine = { productId: string; variantId: string; name: string; quantity: number; personIndex: number };
type PersonForm = { customerId: string; name: string; email: string; phone: string };

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const initialState: CreateOrderState = {};

export function CreateOrderClient({
  categories,
  products,
  customers,
  openingHours,
  holidays,
  timezone,
}: {
  categories: Category[];
  products: Product[];
  customers: Customer[];
  currency: string;
  openingHours: OpeningHours | null;
  holidays: HolidaysConfig | null;
  timezone: string;
}) {
  const sym = useCurrencySymbol();
  const now = new Date();
  const inHour = new Date(now.getTime() + 60 * 60 * 1000);

  const [startAt, setStartAt] = useState(toLocalInputValue(now));
  const [endAt, setEndAt] = useState(toLocalInputValue(inHour));
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [quotes, setQuotes] = useState<Record<string, number | null>>({});
  const [availability, setAvailability] = useState<Record<string, { available: number; total: number }>>({});
  const [activePerson, setActivePerson] = useState(0);
  const [persons, setPersons] = useState<PersonForm[]>([{ customerId: "", name: "", email: "", phone: "" }]);
  const [deliveryRequired, setDeliveryRequired] = useState(false);
  const [returnMethod, setReturnMethod] = useState<"STORE" | "PICKUP">("STORE");
  const [mode, setMode] = useState<"now" | "reserve">("now");
  const [allowOutsideHours, setAllowOutsideHours] = useState(false);

  const [state, formAction, pending] = useActionState(createOrderAction, initialState);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (categoryId && !p.categoryIds.includes(categoryId)) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [products, categoryId, search]);

  const allVariantIds = useMemo(() => products.flatMap((p) => p.variants.map((v) => v.id)), [products]);

  useEffect(() => {
    const from = new Date(startAt);
    const to = new Date(endAt);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || allVariantIds.length === 0) return;

    const controller = new AbortController();
    setAvailability({});
    // The catalog can hold hundreds of variants: fetch in URL-sized batches and
    // merge results as they arrive so every card gets a real count, not just the first page.
    const BATCH = 40;
    for (let i = 0; i < allVariantIds.length; i += BATCH) {
      const params = new URLSearchParams({
        variantIds: allVariantIds.slice(i, i + BATCH).join(","),
        from: from.toISOString(),
        to: to.toISOString(),
      });
      fetch(`/api/availability?${params.toString()}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          setAvailability((prev) => {
            const next = { ...prev };
            for (const a of data.availability ?? []) next[a.variantId] = { available: a.available, total: a.available };
            return next;
          });
        })
        .catch(() => {});
    }
    return () => controller.abort();
  }, [startAt, endAt, allVariantIds]);

  // If the dates change and less is free than the order already holds, trim it and say so.
  const [trimmed, setTrimmed] = useState<string[]>([]);
  useEffect(() => {
    if (Object.keys(availability).length === 0) return;
    setCart((prev) => {
      const left: Record<string, number> = {};
      for (const [id, a] of Object.entries(availability)) left[id] = a.available;
      const next: Record<string, CartLine> = {};
      const notes: string[] = [];
      for (const [key, line] of Object.entries(prev)) {
        const free = left[line.variantId];
        if (free === undefined) {
          next[key] = line;
          continue;
        }
        const keep = Math.min(line.quantity, Math.max(free, 0));
        left[line.variantId] = free - keep;
        if (keep > 0) next[key] = { ...line, quantity: keep };
        if (keep < line.quantity) notes.push(keep === 0 ? `${line.name} is not free for these dates and was removed.` : `${line.name} was reduced to ${keep}, all that is free for these dates.`);
      }
      if (notes.length === 0) return prev;
      setTimeout(() => setTrimmed(notes), 0);
      return next;
    });
  }, [availability]);

  const cartVariantKey = [...new Set(Object.values(cart).map((l) => l.variantId))].sort().join(",");
  useEffect(() => {
    const from = new Date(startAt);
    const to = new Date(endAt);
    if (!cartVariantKey || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ variantIds: cartVariantKey, from: from.toISOString(), to: to.toISOString() });
    fetch(`/api/quote?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const map: Record<string, number | null> = {};
        for (const q of data.quotes ?? []) map[q.variantId] = q.price;
        setQuotes(map);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [cartVariantKey, startAt, endAt]);

  // A line is one product for one customer, so the same product can be split between customers.
  const lineKey = (variantId: string, personIndex: number) => `${variantId}|${personIndex}`;
  const inCartOf = (variantId: string) =>
    Object.values(cart)
      .filter((l) => l.variantId === variantId)
      .reduce((n, l) => n + l.quantity, 0);

  function addToCart(product: Product, variant: Variant) {
    setCart((prev) => {
      const key = lineKey(variant.id, activePerson);
      const existing = prev[key];
      // Never more than what is free for these dates, counting what every customer already has of it.
      const free = availability[variant.id]?.available;
      const inCartAll = Object.values(prev).filter((l) => l.variantId === variant.id).reduce((n, l) => n + l.quantity, 0);
      if (free !== undefined && inCartAll >= free) return prev;
      return {
        ...prev,
        [key]: {
          productId: product.id,
          variantId: variant.id,
          name: product.name,
          quantity: (existing?.quantity ?? 0) + 1,
          personIndex: activePerson,
        },
      };
    });
  }

  function updateQty(key: string, quantity: number) {
    setCart((prev) => {
      const line = prev[key];
      if (!line) return prev;
      if (quantity <= 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      // Never more than what is free after every other customer's share of the same product.
      const others = Object.entries(prev)
        .filter(([k, l]) => k !== key && l.variantId === line.variantId)
        .reduce((n, [, l]) => n + l.quantity, 0);
      const free = availability[line.variantId]?.available;
      const clamped = free !== undefined ? Math.min(quantity, Math.max(free - others, 0)) : quantity;
      if (clamped <= 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { ...line, quantity: clamped } };
    });
  }

  function updatePerson(index: number, patch: Partial<PersonForm>) {
    setPersons((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function applyPreset(minutes: number) {
    const start = mode === "now" ? new Date() : new Date(startAt);
    if (Number.isNaN(start.getTime())) return;
    if (mode === "now") setStartAt(toLocalInputValue(start));
    setEndAt(toLocalInputValue(new Date(start.getTime() + minutes * 60_000)));
  }

  function switchMode(next: "now" | "reserve") {
    setMode(next);
    if (next === "now") {
      const start = new Date();
      const len = Math.max(new Date(endAt).getTime() - new Date(startAt).getTime(), 60 * 60_000);
      setStartAt(toLocalInputValue(start));
      setEndAt(toLocalInputValue(new Date(start.getTime() + (Number.isFinite(len) ? len : 3_600_000))));
    }
  }

  const durationMinutes = Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000);
  const startDate = new Date(startAt);
  const endDate = new Date(endAt);
  const hoursOk =
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    (isWithinOpeningHours(openingHours, startDate, timezone, holidays) && isWithinOpeningHours(openingHours, endDate, timezone, holidays));

  function addPerson() {
    setPersons((prev) => [...prev, { customerId: "", name: "", email: "", phone: "" }]);
  }

  function removePerson(index: number) {
    setPersons((prev) => prev.filter((_, i) => i !== index));
    setCart((prev) => {
      const next: Record<string, CartLine> = {};
      for (const line of Object.values(prev)) {
        if (line.personIndex === index) continue;
        const personIndex = line.personIndex > index ? line.personIndex - 1 : line.personIndex;
        next[lineKey(line.variantId, personIndex)] = { ...line, personIndex };
      }
      return next;
    });
    setActivePerson((a) => (a === index ? 0 : a > index ? a - 1 : a));
  }

  const cartLines = Object.values(cart);
  const unpriced = cartLines.filter((l) => quotes[l.variantId] === null);
  const total = cartLines.reduce((sum, l) => sum + l.quantity * (quotes[l.variantId] ?? 0), 0);

  const isFilled = (p: PersonForm) => Boolean(p.customerId || p.name.trim());
  const filledIndexes = persons.map((p, i) => (isFilled(p) ? i : -1)).filter((i) => i >= 0);
  const payloadIndex = new Map(filledIndexes.map((original, position) => [original, position]));
  // Items held by a customer who hasn't been filled in yet would end up on the wrong person.
  const orphanLines = cartLines.filter((l) => !payloadIndex.has(l.personIndex));

  const payload = JSON.stringify({
    persons: filledIndexes.map((i, position) => {
      const p = persons[i];
      return {
        customerId: p.customerId || undefined,
        name: p.customerId ? (customers.find((c) => c.id === p.customerId)?.name ?? p.name) : p.name,
        email: p.email || undefined,
        phone: p.phone || undefined,
        isLiableCustomer: position === 0,
      };
    }),
    startAt: new Date(startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    deliveryRequired,
    returnMethod,
    bookNow: mode === "now",
    allowOutsideHours,
    channel: "ADMIN",
    lines: cartLines
      .filter((l) => payloadIndex.has(l.personIndex))
      .map((l) => ({ variantId: l.variantId, quantity: l.quantity, personIndex: payloadIndex.get(l.personIndex) })),
  });

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)] lg:flex-row">
      <div className="min-w-0 flex-1 p-4 lg:overflow-y-auto lg:p-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Create order</h1>
          <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-neutral-300 text-sm font-medium">
            <button
              type="button"
              onClick={() => switchMode("now")}
              className={`px-4 py-2 ${mode === "now" ? "bg-brand text-white" : "bg-white text-neutral-600"}`}
            >
              BOOK NOW
            </button>
            <button
              type="button"
              onClick={() => switchMode("reserve")}
              className={`px-4 py-2 ${mode === "reserve" ? "bg-brand text-white" : "bg-white text-neutral-600"}`}
            >
              RESERVE
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="text-neutral-500">Order duration:</label>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              disabled={mode === "now"}
              className="input w-auto disabled:bg-neutral-100"
            />
            <span>-</span>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="input w-auto"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.minutes}
                type="button"
                onClick={() => applyPreset(p.minutes)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  durationMinutes === p.minutes ? "border-brand bg-brand text-white" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {!hoursOk && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              The pickup or return time is outside the store opening hours.
              <label className="mt-1 flex items-center gap-2">
                <input type="checkbox" checked={allowOutsideHours} onChange={(e) => setAllowOutsideHours(e.target.checked)} />
                Book anyway
              </label>
            </div>
          )}
        </div>

        <div className="mb-4 flex gap-3">
          <input
            placeholder="Search products"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input max-w-sm"
          />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input max-w-xs">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filteredProducts.map((product) =>
            product.variants.map((variant) => {
              const avail = availability[variant.id];
              const inCart = inCartOf(variant.id);
              const remaining = avail ? avail.available - inCart : undefined;
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => addToCart(product, variant)}
                  disabled={remaining !== undefined && remaining <= 0}
                  className="card min-w-0 text-left [overflow-wrap:anywhere] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <p className="font-medium">{product.name}</p>
                  <p className="text-xs text-neutral-400">
                    {variant.isSimple ? variant.skuLabel : `${variant.name} (bundle)`}
                  </p>
                  <p className={`mt-2 text-sm ${remaining === undefined ? "text-neutral-400" : remaining <= 0 ? "text-red-600" : remaining <= 2 ? "text-amber-700" : "text-neutral-500"}`}>
                    {remaining === undefined ? "..." : remaining <= 0 ? (inCart > 0 ? "None left" : "Unavailable") : `${remaining} available`}
                    {inCart > 0 && <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-xs font-medium text-brand">{inCart} added</span>}
                  </p>
                </button>
              );
            })
          )}
          {filteredProducts.length === 0 && (
            <p className="col-span-full text-center text-neutral-400">No products match.</p>
          )}
        </div>
      </div>

      <aside className="w-full shrink-0 border-t border-neutral-200 bg-white p-4 lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-6">
        <h2 className="mb-4 text-sm font-semibold">Customers</h2>
        {persons.map((p, i) => (
          <div
            key={i}
            className={`mb-3 rounded-lg border p-3 ${persons.length > 1 && activePerson === i ? "border-brand ring-1 ring-brand" : "border-neutral-200"}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">
                Customer {i + 1} {i === 0 && "(liable)"}
              </span>
              {persons.length > 1 && (
                <button
                  type="button"
                  onClick={() => setActivePerson(i)}
                  className={`text-xs ${activePerson === i ? "font-semibold text-brand" : "text-neutral-500 hover:text-brand"}`}
                >
                  {activePerson === i ? "Adding items" : "Add items for them"}
                </button>
              )}
              {persons.length > 1 && (
                <button type="button" onClick={() => removePerson(i)} className="text-xs text-red-500">
                  Remove
                </button>
              )}
            </div>
            <select
              value={p.customerId}
              onChange={(e) => updatePerson(i, { customerId: e.target.value })}
              className="input mb-2"
            >
              <option value="">New customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {!p.customerId && (
              <div className="space-y-2">
                <input
                  placeholder="Name"
                  value={p.name}
                  onChange={(e) => updatePerson(i, { name: e.target.value })}
                  className="input"
                />
                <input
                  type="email"
                  placeholder="Email (for confirmations)"
                  value={p.email}
                  onChange={(e) => updatePerson(i, { email: e.target.value })}
                  className="input"
                />
                <input
                  placeholder="Phone"
                  value={p.phone}
                  onChange={(e) => updatePerson(i, { phone: e.target.value })}
                  className="input"
                />
              </div>
            )}
          </div>
        ))}
        <button type="button" onClick={addPerson} className="btn mb-4 w-full">
          + Add customer
        </button>

        <label className="mb-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={deliveryRequired}
            onChange={(e) => setDeliveryRequired(e.target.checked)}
          />
          Delivery required
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-neutral-500">Return</span>
          <select value={returnMethod} onChange={(e) => setReturnMethod(e.target.value as "STORE" | "PICKUP")} className="input">
            <option value="STORE">Return to store</option>
            <option value="PICKUP">Pickup</option>
          </select>
        </label>

        <h2 className="mb-2 text-sm font-semibold">Cart</h2>
        <div className="mb-4 space-y-2">
          {persons.map((person, pi) => {
            const lines = Object.entries(cart).filter(([, l]) => l.personIndex === pi);
            if (lines.length === 0) return null;
            const who = person.customerId ? (customers.find((c) => c.id === person.customerId)?.name ?? "") : person.name.trim();
            return (
              <div key={pi} className="space-y-2">
                {persons.length > 1 && (
                  <p className="border-b border-neutral-100 pb-1 text-xs font-medium text-neutral-500">
                    Customer {pi + 1}
                    {who ? `: ${who}` : " (name needed)"}
                  </p>
                )}
                {lines.map(([key, line]) => (
                  <div key={key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {line.name}
                      <span className="block text-xs text-neutral-400">
                        {quotes[line.variantId] === undefined
                          ? "..."
                          : quotes[line.variantId] === null
                            ? "No rate for this duration"
                            : `${sym}${(quotes[line.variantId] as number).toFixed(2)} each`}
                      </span>
                    </span>
                    <QtyStepper
                      size="sm"
                      value={line.quantity}
                      max={
                        availability[line.variantId]
                          ? availability[line.variantId]!.available - (inCartOf(line.variantId) - line.quantity)
                          : undefined
                      }
                      onChange={(n) => updateQty(key, n)}
                    />
                  </div>
                ))}
              </div>
            );
          })}
          {cartLines.length === 0 && <p className="text-sm text-neutral-400">No items yet.</p>}
          {trimmed.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              {trimmed.map((t) => (
                <p key={t}>{t}</p>
              ))}
              <button type="button" onClick={() => setTrimmed([])} className="mt-1 underline">
                Dismiss
              </button>
            </div>
          )}
        </div>

        <div className="mb-4 flex items-center justify-between border-t border-neutral-200 pt-4">
          <span className="font-medium">Total</span>
          <span className="font-semibold">{sym}{total.toFixed(2)}</span>
        </div>

        {orphanLines.length > 0 && (
          <p className="mb-3 text-sm text-red-600">Some items belong to a customer with no name yet. Fill them in or move the items.</p>
        )}
        {unpriced.length > 0 && (
          <p className="mb-3 text-sm text-red-600">
            {unpriced.map((l) => l.name).join(", ")} has no rate set. Add one in Catalog before booking it.
          </p>
        )}
          {state.error && <p className="mb-3 text-sm text-red-600">{state.error}</p>}
        {state.orderNumber && (
          <p className="mb-3 text-sm text-green-700">Order #{state.orderNumber} created.</p>
        )}

        <form action={formAction}>
          <input type="hidden" name="payload" value={payload} />
          <button
            type="submit"
            disabled={pending || cartLines.length === 0 || unpriced.length > 0 || orphanLines.length > 0 || persons.every((p) => !p.customerId && !p.name.trim())}
            className="btn-primary w-full"
          >
            {pending ? "Creating..." : "Continue"}
          </button>
        </form>
      </aside>
    </div>
  );
}
