import Link from "next/link";
import { Home, CalendarPlus, ClipboardList, FolderOpen, Settings, Store, Tags, Users } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { logoutAction } from "./actions";
import { StoreSwitcher } from "./store-switcher";

export function Sidebar({
  user,
  currentStore,
}: {
  user: SessionUser;
  currentStore: { storeId: string; storeName: string; storeSlug: string; role: string };
}) {
  return (
    <aside className="flex min-h-full w-64 shrink-0 flex-col border-r border-neutral-200 bg-white p-4 max-lg:w-full max-lg:border-r-0 max-lg:pt-12 print:hidden">
      <StoreSwitcher memberships={user.memberships} currentStoreId={currentStore.storeId} />

      <nav className="flex flex-col gap-1 text-sm">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium hover:bg-brand-light">
          <Home size={17} strokeWidth={1.75} />
          Home
        </Link>
        <Link
          href="/orders/create"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium hover:bg-brand-light"
        >
          <CalendarPlus size={17} strokeWidth={1.75} />
          Create order
        </Link>
        <Link href="/orders" className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium hover:bg-brand-light">
          <ClipboardList size={17} strokeWidth={1.75} />
          Orders
        </Link>
        {currentStore.role !== "STAFF" && (
          <Link
            href="/customers"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium hover:bg-brand-light"
          >
            <Users size={17} strokeWidth={1.75} />
            Customers
          </Link>
        )}
        {currentStore.role !== "STAFF" && (
          <Link
            href="/catalog"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium hover:bg-brand-light"
          >
            <Tags size={17} strokeWidth={1.75} />
            Catalog
          </Link>
        )}
        <Link
          href="/inventory"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium hover:bg-brand-light"
        >
          <FolderOpen size={17} strokeWidth={1.75} />
          Inventory
        </Link>
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium hover:bg-brand-light"
        >
          <Settings size={17} strokeWidth={1.75} />
          Settings
        </Link>
      </nav>

      <div className="mt-6">
        <p className="mb-2 px-3 text-xs font-semibold uppercase text-neutral-400">Sales channels</p>
        <span className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-400">
          <Store size={17} strokeWidth={1.75} />
          Online Store
        </span>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-neutral-200 pt-4">
        <div className="text-xs">
          <p className="font-medium">{user.name}</p>
          <p className="text-neutral-400">{currentStore.role}</p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="text-xs text-neutral-500 hover:text-neutral-900">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
