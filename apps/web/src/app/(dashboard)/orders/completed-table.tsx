"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Download, EyeOff, MoreVertical } from "lucide-react";

export type TableColumn = { key: string; label: string; sortable: boolean };
export type TableRow = { id: string; cells: Record<string, ReactNode> };

function HeaderMenu({ column, visibleKeys }: { column: TableColumn; visibleKeys: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  function go(mutate: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    next.delete("limit");
    router.push(`/orders?${next.toString()}`);
    setOpen(false);
  }

  const sortedHere = params.get("sort") === column.key ? params.get("dir") : null;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        aria-label={`${column.label} column menu`}
        onClick={() => setOpen((o) => !o)}
        className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-neutral-200 bg-white py-1 text-sm font-normal normal-case shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {column.sortable && (
            <>
              <button
                type="button"
                onClick={() => go((p) => (sortedHere === "asc" ? (p.delete("sort"), p.delete("dir")) : (p.set("sort", column.key), p.set("dir", "asc"))))}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-50"
              >
                <ArrowUp size={14} /> Sort ascending {sortedHere === "asc" && "✓"}
              </button>
              <button
                type="button"
                onClick={() => go((p) => (sortedHere === "desc" ? (p.delete("sort"), p.delete("dir")) : (p.set("sort", column.key), p.set("dir", "desc"))))}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-50"
              >
                <ArrowDown size={14} /> Sort descending {sortedHere === "desc" && "✓"}
              </button>
            </>
          )}
          <button
            type="button"
            disabled={visibleKeys.length <= 1}
            onClick={() => go((p) => p.set("cols", visibleKeys.filter((k) => k !== column.key).join(",")))}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-50 disabled:text-neutral-400"
          >
            <EyeOff size={14} /> Hide column
          </button>
        </div>
      )}
    </div>
  );
}

export function CompletedTable({ columns, rows }: { columns: TableColumn[]; rows: TableRow[] }) {
  const params = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const visibleKeys = columns.map((c) => c.key);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const exportParams = new URLSearchParams(params.toString());
  exportParams.delete("limit");
  exportParams.delete("cols");
  exportParams.set("tab", "completed");
  if (selected.size > 0) exportParams.set("ids", [...selected].join(","));

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-3 text-sm">
        {selected.size > 0 && <span className="text-neutral-500">{selected.size} selected</span>}
        <a href={`/orders/export?${exportParams.toString()}`} className="btn flex items-center gap-2" download>
          <Download size={14} />
          {selected.size > 0 ? `Export ${selected.size} selected` : "Export all as CSV"}
        </a>
      </div>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-700">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                />
              </th>
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-3 font-medium">
                  <span className="flex items-center justify-between gap-1">
                    {c.label}
                    <HeaderMenu column={c} visibleKeys={visibleKeys} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-b border-neutral-100 last:border-0 hover:bg-neutral-50 ${selected.has(r.id) ? "bg-brand-light/60" : ""}`}>
                <td className="px-4 py-3">
                  <input type="checkbox" aria-label="Select row" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    {r.cells[c.key]}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-neutral-400">
                  No orders match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
