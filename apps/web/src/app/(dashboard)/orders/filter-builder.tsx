"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Filter, Plus, X } from "lucide-react";
import { describeFilter, FILTER_FIELDS, FILTER_OPS } from "@/lib/order-filter-fields";

type Row = { field: string; op: string; value: string };

function parse(f: string): Row {
  const [field, op, ...rest] = f.split("~");
  return { field, op, value: rest.join("~") };
}

/** "Filters" button: a column-based filter builder. Rows are stored in the URL as repeated `f` params. */
export function FilterBuilder() {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.getAll("f");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(active.length ? active.map(parse) : [{ field: "customer", op: "contains", value: "" }]);

  function push(list: string[]) {
    const next = new URLSearchParams(params.toString());
    next.delete("f");
    next.delete("limit");
    for (const f of list) next.append("f", f);
    router.push(`/orders?${next.toString()}`);
  }

  function apply() {
    push(rows.filter((r) => r.value.trim()).map((r) => `${r.field}~${r.op}~${r.value.trim()}`));
    setOpen(false);
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        const merged = { ...r, ...patch };
        if (patch.field && patch.field !== r.field) {
          const def = FILTER_FIELDS.find((f) => f.key === patch.field)!;
          merged.op = FILTER_OPS[def.kind][0][0];
          merged.value = def.options?.[0]?.[0] ?? "";
        }
        return merged;
      })
    );
  }

  return (
    <div className="relative">
      <button type="button" className="btn flex items-center gap-2" onClick={() => setOpen((o) => !o)}>
        <Filter size={14} /> Filters
        {active.length > 0 && <span className="rounded-full bg-brand px-1.5 text-xs text-white">{active.length}</span>}
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 w-[520px] max-w-[90vw] rounded-xl border border-neutral-200 bg-white p-4 shadow-lg">
          <div className="space-y-2">
            {rows.map((r, i) => {
              const def = FILTER_FIELDS.find((f) => f.key === r.field)!;
              return (
                <div key={i} className="flex items-center gap-2">
                  <select value={r.field} onChange={(e) => update(i, { field: e.target.value })} className="input w-36">
                    {FILTER_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <select value={r.op} onChange={(e) => update(i, { op: e.target.value })} className="input w-28">
                    {FILTER_OPS[def.kind].map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {def.kind === "enum" ? (
                    <select value={r.value} onChange={(e) => update(i, { value: e.target.value })} className="input flex-1">
                      {def.options!.map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={def.kind === "date" ? "date" : def.kind === "number" ? "number" : "text"}
                      value={r.value}
                      onChange={(e) => update(i, { value: e.target.value })}
                      placeholder="Value"
                      className="input flex-1"
                    />
                  )}
                  <button
                    type="button"
                    aria-label="Remove filter"
                    onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [{ field: "customer", op: "contains", value: "" }]))}
                    className="rounded p-1 text-neutral-500 hover:bg-neutral-100"
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, { field: "customer", op: "contains", value: "" }])}
              className="flex items-center gap-1 text-sm text-brand"
            >
              <Plus size={14} /> Add filter
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-2 text-sm text-neutral-600"
                onClick={() => {
                  setRows([{ field: "customer", op: "contains", value: "" }]);
                  push([]);
                  setOpen(false);
                }}
              >
                Clear
              </button>
              <button type="button" onClick={apply} className="btn-primary">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {active.length > 0 && !open && (
        <div className="mt-2 flex flex-wrap gap-2">
          {active.map((f) => (
            <span key={f} className="flex items-center gap-1 rounded-full bg-brand-light px-3 py-1 text-xs text-brand">
              {describeFilter(f)}
              <button type="button" aria-label="Remove filter" onClick={() => push(active.filter((x) => x !== f))}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
