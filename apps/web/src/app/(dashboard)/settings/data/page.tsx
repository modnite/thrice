import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { storeIsEmpty } from "@/lib/demo-data";
import { LoadDemoButton, RestoreForm } from "./data-forms";

export default async function DataPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await getCurrentStore(user);
  if (!membership) redirect("/login");
  if (membership.role === "STAFF") redirect("/settings");
  const empty = await storeIsEmpty(membership.storeId);

  return (
    <div className="p-4 md:p-8">
      <Link href="/settings" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Settings
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">Data and backup</h1>
      <p className="mb-6 max-w-2xl text-sm text-neutral-500">Take your business data with you, or bring it in from another THRICE.</p>

      <div className="max-w-2xl space-y-6">
        <section className="card space-y-3">
          <h2 className="font-semibold">Download a backup</h2>
          <p className="text-sm text-neutral-600">
            One file with your settings, catalog, rates, stock, customers, orders and the audit trail. It does not contain user accounts, passwords,
            API keys or the email password. Keep it somewhere safe: it holds your customers&apos; details.
          </p>
          <a href="/api/backup/export" className="btn inline-block">
            Download backup
          </a>
          <p className="text-xs text-neutral-500">A server that runs THRICE should also take its own nightly database backups. This file is for moving data between installs.</p>
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">Restore a backup</h2>
          {empty ? (
            <>
              <p className="text-sm text-neutral-600">
                Bring in a backup made by another THRICE, for example when moving from a demo to your live install. It goes into this store as it is,
                and this store&apos;s settings are replaced by the ones in the file. You keep your own account and sign-in.
              </p>
              <RestoreForm />
            </>
          ) : (
            <p className="text-sm text-neutral-600">
              This store already has data, and a backup can only be restored into an empty one. To restore, use a fresh install (the setup page, then this page).
            </p>
          )}
        </section>

        {empty && (
          <section className="card space-y-3">
            <h2 className="font-semibold">Sample data</h2>
            <p className="text-sm text-neutral-600">Fill this store with a made-up outdoor-gear rental business, with rates, stock, customers and orders, so you can try everything.</p>
            <LoadDemoButton />
          </section>
        )}
      </div>
    </div>
  );
}
