import { CurrencyProvider } from "@/components/currency";
import { getStoreCurrency } from "@/lib/store-currency";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (user.memberships.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-neutral-500">
          Your account isn&apos;t attached to any store yet. Ask an owner to add you.
        </p>
      </div>
    );
  }

  const currentStore = await getCurrentStore(user);
  if (!currentStore) redirect("/login");

  const currency = await getStoreCurrency(currentStore.storeId);

  return (
    <CurrencyProvider code={currency}>
    <div className="flex min-h-dvh flex-col">
      <TopBar
        userName={user.name}
        mobileNav={
          <MobileNav>
            <Sidebar user={user} currentStore={currentStore} />
          </MobileNav>
        }
      />
      <div className="flex flex-1">
        <div className="hidden lg:flex">
          <Sidebar user={user} currentStore={currentStore} />
        </div>
        <main className="min-w-0 flex-1 bg-neutral-50">{children}</main>
      </div>
    </div>
    </CurrencyProvider>
  );
}
