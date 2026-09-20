"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

type Hit = { type: "order" | "customer" | "product" | "stock"; label: string; sub: string; href: string };

const TYPE_LABEL: Record<Hit["type"], string> = { order: "Order", customer: "Customer", product: "Product", stock: "Stock item" };

/** Top-bar search field that opens a Ctrl+K palette across orders, customers, products and serials. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setQuery("");
      setHits([]);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    // Debounce so typing a name doesn't fire a request per keystroke.
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d) => {
          setHits(d.hits ?? []);
          setActive(0);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function go(hit: Hit | undefined) {
    if (!hit) return;
    setOpen(false);
    router.push(hit.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-md bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/20 sm:flex"
      >
        <Search size={13} /> Search <kbd className="ml-6 rounded bg-white/10 px-1.5 text-[10px]">Ctrl+K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-4 [@media(min-height:600px)]:pt-24 print:hidden" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xl overflow-hidden rounded-xl bg-white text-neutral-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-neutral-200 px-4">
              <Search size={16} className="text-neutral-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, hits.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === "Enter") {
                    go(hits[active]);
                  }
                }}
                placeholder="Search orders, customers, products, serial numbers"
                className="w-full py-3 text-sm outline-none"
              />
            </div>
            <ul className="max-h-[50dvh] overflow-y-auto py-1">
              {hits.map((h, i) => (
                <li key={`${h.type}-${h.href}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left ${i === active ? "bg-brand-light" : ""}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{h.label}</span>
                      <span className="block truncate text-xs text-neutral-500">{h.sub}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600">{TYPE_LABEL[h.type]}</span>
                  </button>
                </li>
              ))}
              {query.trim().length >= 2 && !loading && hits.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-neutral-400">Nothing found.</li>
              )}
              {query.trim().length < 2 && <li className="px-4 py-6 text-center text-sm text-neutral-400">Type at least two characters.</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
