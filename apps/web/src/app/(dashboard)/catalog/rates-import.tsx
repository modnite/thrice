"use client";

import { useActionState } from "react";
import { importRatesAction, type RatesImportState } from "./actions";

const initial: RatesImportState = {};

/** Download every product's rates as a spreadsheet, edit it, and upload it back. */
export function RatesImport() {
  const [state, action, pending] = useActionState(importRatesAction, initial);
  return (
    <details className="mb-6 rounded-xl border border-neutral-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Import or export rates (spreadsheet)</summary>
      <div className="space-y-4 border-t border-neutral-100 p-4 text-sm">
        <p className="text-neutral-600">
          Download all current rates, fill in or change them in Excel or Google Sheets, then upload the file. Each product
          you include has its rates replaced; products you leave out are untouched, so it is safe to run again.
        </p>
        <p className="text-xs text-neutral-500">
          Columns: <code>product</code>, <code>variant</code> (leave empty for the default), <code>mode</code> (elapsed or
          calendar), <code>duration</code>, <code>unit</code> (minutes, hours, days, weeks, or <code>flat</code> for one price
          whatever the length), <code>price</code>, <code>additional price</code>. Product names must match exactly.
        </p>
        <a href="/catalog/rates/export" className="btn inline-block" download>
          Download current rates
        </a>
        <form action={action} className="flex flex-wrap items-center gap-3">
          <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Importing..." : "Import rates"}
          </button>
        </form>

        {state.error && <p className="text-red-600">{state.error}</p>}
        {state.applied !== undefined && (
          <div className="space-y-2">
            <p className="font-medium text-green-700">
              Updated the rates of {state.applied} product variant{state.applied === 1 ? "" : "s"}.
            </p>
            {[...(state.skipped ?? []), ...(state.errors ?? [])].length > 0 && (
              <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
                <p className="mb-1 font-medium">Not imported:</p>
                <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
                  {[...(state.errors ?? []), ...(state.skipped ?? [])].map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
