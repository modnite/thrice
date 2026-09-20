"use client";

import { useActionState } from "react";
import { importOrdersAction, type OrdersImportState } from "./actions";

const initial: OrdersImportState = {};

const OUTCOME_LABEL = { imported: "Imported", "would-import": "Ready to import", skipped: "Skipped", error: "Problem" } as const;
const OUTCOME_COLOR = {
  imported: "text-green-700",
  "would-import": "text-green-700",
  skipped: "text-neutral-500",
  error: "text-red-600",
} as const;

export function OrdersImportForm() {
  const [state, action, pending] = useActionState(importOrdersAction, initial);
  const results = state.results ?? [];
  const count = (o: string) => results.filter((r) => r.outcome === o).length;

  return (
    <div className="space-y-6">
      <form action={action} className="card max-w-2xl space-y-4">
        <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
        <div className="flex flex-wrap gap-3">
          <button type="submit" name="mode" value="check" disabled={pending} className="btn">
            {pending ? "Working..." : "1. Check the file"}
          </button>
          <button type="submit" name="mode" value="import" disabled={pending} className="btn-primary">
            2. Import
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          Checking runs the whole import and then undoes it, so you see exactly what would happen (availability, serial numbers,
          product names) without changing anything.
        </p>
      </form>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      {state.results && (
        <div className="space-y-4">
          <p className="text-sm font-medium">
            {state.dryRun ? "Check complete, nothing was saved. " : "Import complete. "}
            {count("imported") + count("would-import")} {state.dryRun ? "ready" : "imported"}, {count("skipped")} skipped, {count("error")} with problems
            {(state.parseErrors?.length ?? 0) > 0 && `, ${state.parseErrors?.length} row problem(s) in the file`}.
          </p>

          {(state.parseErrors?.length ?? 0) > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <p className="mb-1 font-medium">Problems in the file (those orders were left out):</p>
              <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
                {state.parseErrors?.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="max-w-3xl overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-700">
                <tr>
                  <th className="px-4 py-2 font-medium">Order</th>
                  <th className="px-4 py-2 font-medium">Result</th>
                  <th className="px-4 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.orderNumber} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2">#{r.orderNumber}</td>
                    <td className={`px-4 py-2 ${OUTCOME_COLOR[r.outcome]}`}>{OUTCOME_LABEL[r.outcome]}</td>
                    <td className="px-4 py-2 text-neutral-600">{r.message}</td>
                  </tr>
                ))}
                {results.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-neutral-400">
                      No valid orders found in the file.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
