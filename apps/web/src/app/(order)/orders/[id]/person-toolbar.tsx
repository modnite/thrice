"use client";

import { useState, type ReactNode } from "react";

// The subtotal pill + "Add products" / "Edit" buttons on a person card. Each button
// opens its (server-rendered) panel directly underneath, like TWICE.
export function PersonToolbar({
  subtotal,
  addPanel,
  editPanel,
  disabled = false,
}: {
  subtotal: string;
  addPanel: ReactNode;
  editPanel: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState<"add" | "edit" | null>(null);

  return (
    <div className="border-b border-neutral-200">
      <div className="flex items-center justify-between gap-3 p-3">
        <span className="rounded bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700">{subtotal}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(open === "add" ? null : "add")}
            disabled={disabled}
            className="px-3 py-1.5 text-sm font-medium text-brand hover:underline disabled:text-neutral-400 disabled:no-underline"
          >
            Add products
          </button>
          <button
            type="button"
            onClick={() => setOpen(open === "edit" ? null : "edit")}
            disabled={disabled}
            className={`rounded border px-4 py-1.5 text-sm font-medium disabled:text-neutral-400 disabled:hover:bg-transparent ${
              open === "edit" ? "border-brand bg-brand text-white" : "border-neutral-300 hover:bg-neutral-50"
            }`}
          >
            Edit
          </button>
        </div>
      </div>
      {open === "add" && <div className="border-t border-neutral-100 bg-neutral-50 p-4">{addPanel}</div>}
      {open === "edit" && <div className="border-t border-neutral-100 bg-neutral-50 p-4">{editPanel}</div>}
    </div>
  );
}
