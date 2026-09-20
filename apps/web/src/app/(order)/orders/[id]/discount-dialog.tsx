"use client";

import { useState } from "react";
import { Percent } from "lucide-react";
import { setDiscountAction } from "./actions";

const PRESETS = Array.from({ length: 21 }, (_, i) => i * 5);

// "Give discount" dialog like TWICE: pick a percentage or type the final price,
// the other one follows. Submits only the percentage; the server recomputes the total.
export function DiscountDialog({
  orderId,
  original,
  currentPercent,
  currency,
  className,
}: {
  orderId: string;
  original: number;
  currentPercent: number | null;
  currency: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState<number>(currentPercent ?? 0);
  const [finalPrice, setFinalPrice] = useState<string>(
    (original - (original * (currentPercent ?? 0)) / 100).toFixed(2)
  );

  function onPercent(value: number) {
    setPercent(value);
    setFinalPrice((original - (original * value) / 100).toFixed(2));
  }

  function onFinal(raw: string) {
    setFinalPrice(raw);
    const n = Number(raw);
    if (!Number.isFinite(n) || original <= 0) return;
    const clamped = Math.min(Math.max(n, 0), original);
    setPercent(Math.round((1 - clamped / original) * 10000) / 100);
  }

  const discounted = (original * percent) / 100;
  const inPresets = PRESETS.includes(percent);

  return (
    <>
      <button
        type="button"
        title="Discount"
        aria-label="Discount"
        onClick={() => {
          onPercent(currentPercent ?? 0);
          setOpen(true);
        }}
        className={className ?? "rounded p-2 text-neutral-700 hover:bg-neutral-100"}
      >
        <Percent size={20} strokeWidth={1.75} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex overflow-y-auto bg-black/40 p-4 print:hidden" onClick={() => setOpen(false)}>
          <div className="m-auto w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-brand px-6 py-4 text-lg font-semibold text-white">Give discount</div>
            <form
              action={async (fd) => {
                await setDiscountAction(orderId, fd);
                setOpen(false);
              }}
              className="space-y-4 p-6 text-sm"
            >
              <div>
                <p>
                  Original price: {currency} {original.toFixed(2)}
                </p>
                <p>
                  Discounted amount: {currency} {discounted.toFixed(2)}
                </p>
              </div>
              <label className="block">
                <span className="text-xs text-brand">Discount</span>
                <select
                  value={inPresets ? percent : ""}
                  onChange={(e) => onPercent(Number(e.target.value))}
                  className="input mt-1"
                >
                  {!inPresets && <option value="">{percent}% (custom)</option>}
                  {PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {p} %
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">Final price</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={original}
                    step="0.01"
                    value={finalPrice}
                    onChange={(e) => onFinal(e.target.value)}
                    className="input"
                  />
                  <span className="text-neutral-500">{currency}</span>
                </div>
              </label>
              <input type="hidden" name="discountPercent" value={percent > 0 ? percent : ""} />
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-neutral-600">
                  Cancel
                </button>
                <button type="submit" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
                  Apply discount
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
