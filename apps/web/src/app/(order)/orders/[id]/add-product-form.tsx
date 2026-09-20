"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { QtyStepper } from "@/components/qty-stepper";
import { addProductToOrderAction, type AddProductState } from "./actions";

type Variant = { id: string; label: string };
type Person = { id: string; name: string };
type Info = { available: number; price: number | null };

const initialState: AddProductState = {};
const SHOWN = 8;

/**
 * Adds a product to an order. It looks up what is actually free for this order's dates, shows it next to each
 * product, and won't let the quantity go past it. The server checks again when you press Add.
 */
export function AddProductForm({
  orderId,
  variants,
  persons,
  defaultPersonId,
  from,
  to,
  currency,
}: {
  orderId: string;
  variants: Variant[];
  persons: Person[];
  defaultPersonId?: string;
  from: string;
  to: string;
  currency: string;
}) {
  const action = addProductToOrderAction.bind(null, orderId);
  const [state, formAction, pending] = useActionState(action, initialState);

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Variant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [personId, setPersonId] = useState(defaultPersonId ?? "");
  // Stock is only valid for one set of dates and until something is added, so every entry is stamped with both.
  const [infoMap, setInfoMap] = useState<Record<string, Info>>({});
  const [refresh, setRefresh] = useState(0);
  const stamp = `${from}|${to}|${refresh}`;
  const info = useMemo(() => {
    const out: Record<string, Info> = {};
    for (const [k, v] of Object.entries(infoMap)) if (k.startsWith(`${stamp}#`)) out[k.slice(stamp.length + 1)] = v;
    return out;
  }, [infoMap, stamp]);
  const wasPending = useRef(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? variants.filter((v) => v.label.toLowerCase().includes(q)) : variants).slice(0, SHOWN);
  }, [variants, query]);
  const matchCount = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? variants.filter((v) => v.label.toLowerCase().includes(q)).length : variants.length;
  }, [variants, query]);

  // Look up free stock and the price for whatever is on screen.
  const wanted = shown.map((v) => v.id).concat(picked && !shown.some((v) => v.id === picked.id) ? [picked.id] : []);
  const wantedKey = wanted.join(",");
  useEffect(() => {
    const missing = wanted.filter((id) => !info[id]);
    if (missing.length === 0) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ variantIds: missing.join(","), from, to });
    Promise.all([
      fetch(`/api/availability?${params}`, { signal: controller.signal }).then((r) => r.json()),
      fetch(`/api/quote?${params}`, { signal: controller.signal }).then((r) => r.json()),
    ])
      .then(([avail, quote]) => {
        setInfoMap((prev) => {
          const next = { ...prev };
          for (const a of avail.availability ?? []) next[`${stamp}#${a.variantId}`] = { available: a.available, price: null };
          for (const q of quote.quotes ?? []) {
            const key = `${stamp}#${q.variantId}`;
            if (next[key]) next[key] = { ...next[key]!, price: q.price };
          }
          return next;
        });
      })
      .catch(() => {});
    return () => controller.abort();
    // `info` is deliberately left out: it is only read to skip what is already known for this stamp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, stamp]);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      setPicked(null);
      setQuery("");
      setQuantity(1);
      setRefresh((n) => n + 1);
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  const pickedInfo = picked ? info[picked.id] : undefined;
  const max = pickedInfo?.available;
  const clamp = (n: number) => Math.max(1, max === undefined ? n : Math.min(n, max));
  const canAdd = !!picked && !pending && pickedInfo !== undefined && pickedInfo.available >= 1 && pickedInfo.price !== null;

  return (
    <form action={formAction} className="card mb-6 space-y-3 print:hidden">
      <h2 className="text-sm font-semibold">Add product</h2>
      <input type="hidden" name="variantId" value={picked?.id ?? ""} />
      <input type="hidden" name="quantity" value={quantity} />
      <input type="hidden" name="personId" value={personId} />

      {!picked && (
        <>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="input w-full" autoComplete="off" />
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {shown.map((v) => {
              const i = info[v.id];
              const out = i !== undefined && i.available < 1;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    disabled={out}
                    onClick={() => {
                      setPicked(v);
                      setQuantity(1);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <span className="min-w-0 truncate">{v.label}</span>
                    <span className="shrink-0 text-xs">
                      {i === undefined ? (
                        <span className="text-neutral-400">...</span>
                      ) : out ? (
                        <span className="text-red-600">None free</span>
                      ) : (
                        <span className={i.available <= 2 ? "text-amber-700" : "text-green-700"}>{i.available} free</span>
                      )}
                      {i?.price != null && <span className="ml-2 text-neutral-500">{currency} {i.price.toFixed(2)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-3 py-3 text-sm text-neutral-400">No products match.</li>}
          </ul>
          {matchCount > SHOWN && <p className="text-xs text-neutral-400">Showing {SHOWN} of {matchCount}. Type to narrow it down.</p>}
        </>
      )}

      {picked && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{picked.label}</p>
              <p className="text-xs text-neutral-500">
                {pickedInfo === undefined
                  ? "Checking stock..."
                  : pickedInfo.available < 1
                    ? "None free for this order's dates."
                    : `${pickedInfo.available} free for this order's dates`}
                {pickedInfo?.price != null && ` · ${currency} ${pickedInfo.price.toFixed(2)} each`}
              </p>
              {pickedInfo && pickedInfo.price === null && <p className="text-xs text-red-600">No rate for this duration. Add one in Catalog first.</p>}
            </div>
            <button type="button" onClick={() => setPicked(null)} className="shrink-0 text-xs text-neutral-500 underline">
              Change
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <QtyStepper value={quantity} min={1} max={max} onChange={(n) => setQuantity(clamp(n))} />
            {max !== undefined && quantity >= max && max > 0 && <span className="text-xs text-amber-700">That is all that is free.</span>}
            {persons.length > 1 && (
              <select value={personId} onChange={(e) => setPersonId(e.target.value)} className="input w-40">
                <option value="">Unassigned</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            {pickedInfo?.price != null && <span className="ml-auto text-sm font-medium">{currency} {(pickedInfo.price * quantity).toFixed(2)}</span>}
          </div>

          <button type="submit" disabled={!canAdd} className="btn-primary w-full sm:w-auto">
            {pending ? "Adding..." : `Add ${quantity > 1 ? `${quantity} ` : ""}to order`}
          </button>
        </div>
      )}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
