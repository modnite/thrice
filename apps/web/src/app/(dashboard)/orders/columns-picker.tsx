"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function ColumnsPicker({
  columns,
  visible,
}: {
  columns: { key: string; label: string }[];
  visible: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(new Set(visible));

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function apply() {
    const next = new URLSearchParams(params.toString());
    // Keep column order stable and never allow an empty table.
    const keys = columns.map((c) => c.key).filter((k) => selected.has(k));
    if (keys.length === 0) return;
    next.set("cols", keys.join(","));
    router.push(`/orders?${next.toString()}`);
    setOpen(false);
  }

  return (
    <div className="relative mb-3 w-fit">
      <button type="button" className="btn" onClick={() => setOpen((o) => !o)}>
        Columns
      </button>
      {open && (
        <div className="absolute left-0 z-10 mt-2 w-64 rounded-xl border border-neutral-200 bg-white p-3 text-sm shadow-lg">
          <div className="space-y-1">
            {columns.map((c) => (
              <label key={c.key} className="flex items-center gap-2">
                <input type="checkbox" checked={selected.has(c.key)} onChange={() => toggle(c.key)} />
                {c.label}
              </label>
            ))}
          </div>
          <button type="button" className="btn-primary mt-3 w-full" onClick={apply}>
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
