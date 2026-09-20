import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@thrice/db";
import { getSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { formatDateTime } from "@/lib/format";
import { detectOrigin, revokeApiKeyAction } from "./actions";
import { mailSource, type SmtpConfig } from "@/lib/mailer";
import { EmailForm } from "./email-form";
import { AddressesForm, CopyButton, CreateKeyForm } from "./forms";
import { WebsiteConnection } from "../website-connection";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await getCurrentStore(user);
  if (!membership) redirect("/login");
  if (membership.role === "STAFF") redirect("/settings");

  const { q = "" } = await searchParams;
  const term = q.trim();
  const [store, keys, products, detected] = await Promise.all([
    prisma.store.findUniqueOrThrow({ where: { id: membership.storeId }, select: { slug: true, timezone: true, publicUrl: true, websiteUrl: true, smtpConfig: true } }),
    prisma.apiKey.findMany({ where: { storeId: membership.storeId }, orderBy: { createdAt: "desc" } }),
    term
      ? prisma.product.findMany({
          where: { storeId: membership.storeId, name: { contains: term, mode: "insensitive" } },
          select: { id: true, name: true, variants: { orderBy: { displayOrder: "asc" }, select: { id: true, name: true } } },
          orderBy: { name: "asc" },
          take: 15,
        })
      : Promise.resolve([]),
    detectOrigin(),
  ]);
  const smtp = store.smtpConfig as SmtpConfig | null;
  const mail = await mailSource(membership.storeId);
  const legacyKeys = (process.env.PUBLIC_API_KEY_HASHES ?? "").split(",").filter((h) => h.trim()).length;

  return (
    <div className="p-4 md:p-8">
      <Link href="/settings" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Settings
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">Integrations</h1>
      <p className="mb-6 max-w-2xl text-sm text-neutral-500">
        Connect a customer website so its bookings land here as online orders, and set up the email that sends order confirmations. Everything is set on this page. No server files to edit.
      </p>

      <div className="max-w-2xl">
        <WebsiteConnection storeId={membership.storeId} storeSlug={store.slug} timezone={store.timezone} />
      </div>

      <div className="space-y-6">
        <AddressesForm publicUrl={store.publicUrl ?? ""} websiteUrl={store.websiteUrl ?? ""} detected={detected ?? ""} />

        <section className="max-w-2xl space-y-3">
          <h2 className="font-semibold">API keys</h2>
          {keys.length === 0 && legacyKeys === 0 && <p className="text-sm text-neutral-500">No keys yet. The website connection is off until you create one.</p>}
          {keys.map((k) => (
            <div key={k.id} className="card flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {k.name} {k.revokedAt && <span className="ml-1 rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-normal text-neutral-600">Revoked</span>}
                </p>
                <p className="text-xs text-neutral-500">
                  {k.keyPrefix}&hellip; &middot; created {formatDateTime(k.createdAt, store.timezone)} &middot;{" "}
                  {k.lastUsedAt ? `last used ${formatDateTime(k.lastUsedAt, store.timezone)}` : "never used"}
                </p>
              </div>
              {!k.revokedAt && (
                <form action={revokeApiKeyAction}>
                  <input type="hidden" name="id" value={k.id} />
                  <button type="submit" className="btn text-red-700">
                    Revoke
                  </button>
                </form>
              )}
            </div>
          ))}
          {legacyKeys > 0 && (
            <p className="text-xs text-neutral-500">
              {legacyKeys} more key{legacyKeys === 1 ? " is" : "s are"} set in the server&apos;s .env file (the older method). They keep working. To remove them, empty PUBLIC_API_KEY_HASHES there.
            </p>
          )}
          <CreateKeyForm />
        </section>

        <EmailForm
          source={mail}
          initial={smtp?.host ? { host: smtp.host, port: smtp.port, secure: smtp.secure, user: smtp.user ?? "", from: smtp.from, hasPassword: !!smtp.passwordSealed } : null}
        />

        <section className="max-w-2xl space-y-3">
          <h2 className="font-semibold">Find product IDs</h2>
          <p className="text-sm text-neutral-500">The website needs the product ID and variant ID of whatever it books. Search for the product by name.</p>
          <form className="flex gap-2">
            <input name="q" defaultValue={term} placeholder="Product name" className="input min-w-0 flex-1" />
            <button type="submit" className="btn">
              Search
            </button>
          </form>
          {term && products.length === 0 && <p className="text-sm text-neutral-500">No products match &ldquo;{term}&rdquo;.</p>}
          {products.map((p) => (
            <div key={p.id} className="card space-y-2">
              <p className="font-medium">{p.name}</p>
              <IdRow label="Product ID" value={p.id} />
              {p.variants.map((v) => (
                <IdRow key={v.id} label={`Variant: ${v.name}`} value={v.id} />
              ))}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function IdRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="w-40 shrink-0 text-neutral-500">{label}</span>
      <code className="select-all break-all rounded bg-neutral-100 px-1.5 py-0.5">{value}</code>
      <CopyButton text={value} />
    </div>
  );
}
