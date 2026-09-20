import { CurrencyProvider } from "@/components/currency";
import { getStoreCurrency } from "@/lib/store-currency";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { TopBar } from "../(dashboard)/top-bar";

// Full-screen shell for a single order, like TWICE: no sidebar, just a back arrow.
export default async function OrderLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const currentStore = await getCurrentStore(user);
  if (!currentStore) redirect("/login");

  const currency = await getStoreCurrency(currentStore.storeId);

  return (
    <CurrencyProvider code={currency}>
    <div className="flex min-h-dvh flex-col lg:h-dvh print:h-auto">
      <TopBar userName={user.name} />
      <div className="flex h-12 shrink-0 items-center border-b border-neutral-200 bg-white px-4 print:hidden">
        <Link href="/orders" className="flex items-center gap-2 text-sm font-medium hover:text-brand">
          <ArrowLeft size={18} />
          Orders
        </Link>
      </div>
      <main className="bg-white lg:min-h-0 lg:flex-1">{children}</main>
    </div>
    </CurrencyProvider>
  );
}
