"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import type { PaymentMethodOption } from "@thrice/shared/payment-methods";

const MAX = 20;

// Names to offer as one-click additions. These only add a name to record payments under; taking the payment through
// a provider is still done in that provider's own system. Some regions have local providers worth suggesting.
const GENERIC_SUGGESTIONS = ["PayPal", "Stripe", "Square", "Cheque", "Bank deposit", "Mobile wallet"];
const REGIONAL_SUGGESTIONS: Record<string, string[]> = {
  TTD: ["WiPay", "PowerTranz", "Linx", "PayPal", "Cheque", "Bank deposit"],
};

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 12) : String(Date.now());
}

/** Add, rename, show or hide, reorder and remove the payment options staff can choose from. */
export function PaymentMethodsEditor({ initial, currency = "USD" }: { initial: PaymentMethodOption[]; currency?: string }) {
  const SUGGESTIONS = REGIONAL_SUGGESTIONS[currency] ?? GENERIC_SUGGESTIONS;
  const [methods, setMethods] = useState<PaymentMethodOption[]>(initial);

  const update = (id: string, patch: Partial<PaymentMethodOption>) =>
    setMethods((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const move = (index: number, by: -1 | 1) =>
    setMethods((prev) => {
      const next = [...prev];
      const target = index + by;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const add = (label = "") => setMethods((prev) => (prev.length >= MAX ? prev : [...prev, { id: newId(), label, description: "", enabled: true }]));

  const names = methods.map((m) => m.label.trim().toLowerCase());
  const isDuplicate = (label: string) => label.trim() !== "" && names.filter((n) => n === label.trim().toLowerCase()).length > 1;
  const unusedSuggestions = SUGGESTIONS.filter((s) => !names.includes(s.toLowerCase()));

  return (
    <section className="card space-y-4">
      <input type="hidden" name="paymentMethods" value={JSON.stringify(methods)} />
      <div>
        <h2 className="font-semibold">Payment methods</h2>
        <p className="mt-1 text-xs text-neutral-500">
          The options staff pick from when recording a payment. Hidden options stay on old orders but can&apos;t be chosen for new
          ones. The description shows under the option, which is a good place for bank details. Changes apply when you save the settings.
        </p>
      </div>

      <ul className="space-y-3">
        {methods.map((m, i) => (
          <li key={m.id} className={`rounded-lg border p-3 ${m.enabled ? "border-neutral-200" : "border-neutral-200 bg-neutral-50"}`}>
            <div className="flex items-center gap-2">
              <input
                value={m.label}
                onChange={(e) => update(m.id, { label: e.target.value })}
                maxLength={40}
                placeholder="Name"
                aria-label="Payment option name"
                className={`input flex-1 py-1.5 font-medium ${isDuplicate(m.label) || m.label.trim() === "" ? "border-red-400" : ""}`}
              />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30">
                <ArrowUp size={16} />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === methods.length - 1} aria-label="Move down" className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30">
                <ArrowDown size={16} />
              </button>
              <button
                type="button"
                onClick={() => update(m.id, { enabled: !m.enabled })}
                aria-pressed={m.enabled}
                title={m.enabled ? "Shown to staff. Click to hide." : "Hidden from staff. Click to show."}
                className={`flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium ${m.enabled ? "bg-green-100 text-green-800" : "bg-neutral-200 text-neutral-600"}`}
              >
                {m.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                {m.enabled ? "Shown" : "Hidden"}
              </button>
              <button type="button" onClick={() => setMethods((prev) => prev.filter((x) => x.id !== m.id))} aria-label={`Remove ${m.label || "option"}`} className="rounded p-1.5 text-red-600 hover:bg-red-50">
                <Trash2 size={16} />
              </button>
            </div>
            {isDuplicate(m.label) && <p className="mt-1 text-xs text-red-600">Another option already has this name.</p>}
            <textarea
              value={m.description}
              onChange={(e) => update(m.id, { description: e.target.value })}
              rows={2}
              maxLength={2000}
              placeholder="Description (optional)"
              className="input mt-2 text-sm"
            />
          </li>
        ))}
        {methods.length === 0 && <li className="text-sm text-neutral-500">No payment options. Staff won&apos;t be able to record how an order was paid.</li>}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => add()} disabled={methods.length >= MAX} className="btn flex items-center gap-1">
          <Plus size={14} /> Add payment option
        </button>
        {unusedSuggestions.length > 0 && <span className="text-xs text-neutral-500">Quick add:</span>}
        {unusedSuggestions.map((s) => (
          <button key={s} type="button" onClick={() => add(s)} disabled={methods.length >= MAX} className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50">
            + {s}
          </button>
        ))}
      </div>
    </section>
  );
}
