"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/logo";
import { CommandPalette } from "./command-palette";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function TopBar({ userName, mobileNav }: { userName: string; mobileNav?: ReactNode }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between bg-brand-bar px-4 text-white print:hidden">
      <div className="flex items-center">
        {mobileNav}
        <Link href="/" aria-label="THRICE home" className="flex items-center">
          <Logo className="h-5 w-auto" />
        </Link>
      </div>
      <CommandPalette />
      <div className="flex items-center gap-4 text-sm">
        {now && (
          <span className="hidden text-white/70 sm:inline">
            {now.toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "2-digit" })}{" "}
            {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </span>
        )}
        <span className="flex items-center gap-1 text-white/70">
          <span className="h-2 w-2 rounded-full bg-green-400" />
          Online
        </span>
        <Link
          href="/account"
          title="Your account"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-semibold hover:bg-white/20"
        >
          {initials(userName)}
        </Link>
      </div>
    </header>
  );
}
