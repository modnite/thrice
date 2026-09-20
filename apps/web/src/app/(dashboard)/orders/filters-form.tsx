"use client";

import { Search } from "lucide-react";
import type { ReactNode } from "react";

// The big search bar plus filter pills. Selects apply immediately (like TWICE's pills);
// the search box applies on Enter so typing doesn't reload the page per keystroke.
export function FiltersForm({
  tab,
  q,
  children,
}: {
  tab: string;
  q?: string;
  children: ReactNode;
}) {
  return (
    <form
      className="mb-6"
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === "SELECT") e.currentTarget.requestSubmit();
      }}
    >
      <input type="hidden" name="tab" value={tab} />
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or product code"
          className="w-full rounded-md border border-neutral-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </form>
  );
}

export function Pill({
  name,
  defaultValue,
  label,
  options,
}: {
  name: string;
  defaultValue?: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  const active = Boolean(defaultValue);
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ""}
      className={`rounded-md border px-3 py-1.5 text-sm ${
        active ? "border-brand bg-brand-light text-brand" : "border-neutral-300 bg-white text-neutral-700"
      }`}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
