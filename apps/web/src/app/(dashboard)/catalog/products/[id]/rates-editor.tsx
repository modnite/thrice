"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { quotePrice, wholeDayRows, type PricingMode } from "@thrice/shared/pricing";
import { saveRatesAction, type CatalogState } from "../../actions";
import { useCurrencySymbol } from "@/components/currency";

type Unit = "minutes" | "hours" | "days" | "weeks";
const UNIT_MINUTES: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440, weeks: 10080 };

type Row = { amount: string; unit: Unit; price: string; additional: string };
type Initial = { durationMinutes: number | null; price: number; additionalPrice: number | null };

function toRow(r: Initial): Row {
  const minutes = r.durationMinutes ?? 60;
  const unit: Unit =
    minutes % 10080 === 0 ? "weeks" : minutes % 1440 === 0 ? "days" : minutes % 60 === 0 ? "hours" : "minutes";
  return {
    amount: String(minutes / UNIT_MINUTES[unit]),
    unit,
    price: String(r.price),
    additional: r.additionalPrice === null ? "" : String(r.additionalPrice),
  };
}

const initialState: CatalogState = {};

export function RatesEditor({ variantId, initial, initialMode }: { variantId: string; initial: Initial[]; initialMode: PricingMode }) {
  const sym = useCurrencySymbol();
  const [state, action, pending] = useActionState(saveRatesAction.bind(null, variantId), initialState);
  const isFlatInitially = initial.length > 0 && initial.every((r) => r.durationMinutes === null);
  const [mode, setMode] = useState<"duration" | "flat">(isFlatInitially ? "flat" : "duration");
  const [flatPrice, setFlatPrice] = useState(isFlatInitially ? String(initial[0].price) : "");
  const [rows, setRows] = useState<Row[]>(isFlatInitially ? [] : initial.map(toRow));
  const [pricingMode, setPricingMode] = useState<PricingMode>(initialMode);
  const [previewAmount, setPreviewAmount] = useState("1");
  const [previewUnit, setPreviewUnit] = useState<Unit>("days");

  const rates = useMemo(() => {
    if (mode === "flat") {
      const p = Number(flatPrice);
      return flatPrice.trim() !== "" && Number.isFinite(p) ? [{ durationMinutes: null, price: p, additionalPrice: null }] : [];
    }
    return rows
      .filter((r) => r.price.trim() !== "" && Number(r.amount) > 0)
      .map((r) => ({
        durationMinutes: Math.round(Number(r.amount) * UNIT_MINUTES[r.unit]),
        price: Number(r.price),
        additionalPrice: r.additional.trim() === "" ? null : Number(r.additional),
      }));
  }, [mode, flatPrice, rows]);

  const calendar = pricingMode === "CALENDAR_DAYS" && mode === "duration";
  // In calendar mode the preview is "N calendar days touched"; only whole-day rates count.
  const previewMinutes = calendar ? Math.round(Number(previewAmount)) * 1440 : Math.round(Number(previewAmount) * UNIT_MINUTES[previewUnit]);
  const quote = previewMinutes > 0 ? quotePrice(calendar ? wholeDayRows(rates) : rates, previewMinutes) : null;
  const badForCalendar = calendar && rates.some((r) => r.durationMinutes === null || r.durationMinutes % 1440 !== 0);

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="rates" value={JSON.stringify(rates)} />
      <input type="hidden" name="mode" value={mode === "flat" ? "ELAPSED" : pricingMode} />

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "duration"} onChange={() => setMode("duration")} /> Price by duration
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "flat"} onChange={() => setMode("flat")} /> One flat price
        </label>
      </div>

      {mode === "duration" && (
        <label className="block max-w-md text-sm">
          <span className="mb-1 block text-neutral-500">How a booking is measured</span>
          <select value={pricingMode} onChange={(e) => setPricingMode(e.target.value as PricingMode)} className="input">
            <option value="ELAPSED">Elapsed duration (a day is 24 hours from pickup)</option>
            <option value="CALENDAR_DAYS">Starting at (charge every calendar day the booking touches)</option>
          </select>
        </label>
      )}
      {badForCalendar && (
        <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">
          Calendar-day pricing needs rates in whole days or weeks. Change or remove the hourly rates before saving.
        </p>
      )}

      {mode === "flat" ? (
        <label className="block max-w-xs text-sm">
          <span className="mb-1 block text-neutral-500">Price for any duration ({sym})</span>
          <input type="number" min={0} step="0.01" value={flatPrice} onChange={(e) => setFlatPrice(e.target.value)} className="input" />
        </label>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_32px] gap-2 text-xs text-neutral-500">
            <span>Duration</span>
            <span>Unit</span>
            <span>Price ({sym})</span>
            <span>Additional price ({sym})</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_32px] gap-2">
              <input type="number" min={1} value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} className="input" />
              <select value={r.unit} onChange={(e) => update(i, { unit: e.target.value as Unit })} className="input">
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
                <option value="weeks">weeks</option>
              </select>
              <input type="number" min={0} step="0.01" value={r.price} onChange={(e) => update(i, { price: e.target.value })} className="input" />
              <input
                type="number"
                min={0}
                step="0.01"
                value={r.additional}
                placeholder="Same"
                onChange={(e) => update(i, { additional: e.target.value })}
                className="input"
              />
              <button type="button" aria-label="Remove rate" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))} className="rounded p-1 text-neutral-500 hover:bg-neutral-100">
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, { amount: "1", unit: "days", price: "", additional: "" }])}
            className="flex items-center gap-1 text-sm text-brand"
          >
            <Plus size={14} /> Add rate
          </button>
          <p className="text-xs text-neutral-500">
            A booking takes the longest rate that fits, then fills what is left with shorter rates. The additional price applies to
            every block after the first. Anything shorter than your shortest rate is charged as one block of it.
          </p>
        </div>
      )}

      <div className="rounded-lg bg-neutral-50 p-3 text-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-neutral-500">{calendar ? "Preview a booking touching" : "Preview a booking of"}</span>
          <input type="number" min={1} value={previewAmount} onChange={(e) => setPreviewAmount(e.target.value)} className="input w-20 py-1" />
          {calendar ? (
            <span className="text-neutral-500">calendar days</span>
          ) : (
            <select value={previewUnit} onChange={(e) => setPreviewUnit(e.target.value as Unit)} className="input w-28 py-1">
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
            </select>
          )}
        </div>
        {quote ? (
          <p>
            <span className="font-semibold">{sym}{quote.total.toFixed(2)}</span>
            <span className="text-neutral-500">
              {" "}
              = {quote.blocks.map((b) => (b.durationMinutes === null ? "flat" : `${b.durationMinutes / 60}h @ ${b.price}`)).join(" + ")}
            </span>
          </p>
        ) : (
          <p className="text-neutral-500">Add a rate to see a price.</p>
        )}
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.saved && <p className="text-sm text-green-700">Rates saved.</p>}
      <button type="submit" disabled={pending || badForCalendar} className="btn-primary">
        {pending ? "Saving..." : "Save rates"}
      </button>
    </form>
  );
}
