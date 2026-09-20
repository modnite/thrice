"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

/**
 * Below the tablet breakpoint the sidebar folds away into a hamburger menu, like TWICE's mobile
 * admin. The navigation itself (the server-rendered Sidebar) is passed in as children, so it stays
 * one component with one set of links.
 */
export function MobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close after choosing a page, and on Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="lg:hidden print:hidden">
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="mr-3 rounded p-1.5 text-white hover:bg-white/10"
      >
        <Menu size={22} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="relative h-full w-72 max-w-[85vw] overflow-y-auto bg-white text-neutral-900 shadow-xl">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-2 z-10 rounded p-1.5 text-neutral-600 hover:bg-neutral-100"
            >
              <X size={20} />
            </button>
            {children}
          </div>
          <button type="button" aria-label="Close menu" className="flex-1 bg-black/40" onClick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
