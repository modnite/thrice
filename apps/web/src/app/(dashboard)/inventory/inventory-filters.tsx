"use client";

import { Search } from "lucide-react";

// Big search bar with filter pills underneath, like TWICE's tables. Pills apply as soon as they change;
// the search applies on Enter so typing doesn't reload the page per keystroke.
export function InventoryFilters({ q, status, allocation }: { q?: string; status?: string; allocation?: string }) {
  const pill = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-sm ${active ? "border-brand bg-brand-light text-brand" : "border-neutral-300 bg-white text-neutral-700"}`;
  return (
    <form
      className="mb-4"
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === "SELECT") e.currentTarget.requestSubmit();
      }}
    >
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by serial, SKU code or name"
          className="w-full rounded-md border border-neutral-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <select name="status" defaultValue={status ?? ""} className={pill(Boolean(status))}>
          <option value="">Status</option>
          <option value="IN_USE">In use</option>
          <option value="OUT_OF_USE">Out of use</option>
          <option value="LOST">Lost</option>
        </select>
        <select name="allocation" defaultValue={allocation ?? ""} className={pill(Boolean(allocation))}>
          <option value="">Allocation</option>
          <option value="RENTAL">Rental</option>
          <option value="SALE">Sale</option>
        </select>
      </div>
    </form>
  );
}
