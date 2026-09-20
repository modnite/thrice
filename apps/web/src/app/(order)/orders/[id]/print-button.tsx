"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn print:hidden">
      Print invoice
    </button>
  );
}

export function PrintIconButton() {
  return (
    <button
      type="button"
      title="Print invoice"
      aria-label="Print invoice"
      onClick={() => window.print()}
      className="rounded p-2 text-neutral-700 hover:bg-neutral-100 print:hidden"
    >
      <Printer size={20} strokeWidth={1.75} />
    </button>
  );
}
