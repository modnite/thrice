import { prisma } from "@thrice/db";

/**
 * Shows whether the studio website can book through THRICE, and what has arrived from it lately.
 * It reads the same environment the public API reads, and never shows a key or a hash.
 */
export async function WebsiteConnection({ storeId, storeSlug, timezone }: { storeId: string; storeSlug: string; timezone: string }) {
  const envKeys = (process.env.PUBLIC_API_KEY_HASHES ?? "").split(",").filter((h) => h.trim()).length;
  const envSlug = process.env.PUBLIC_API_STORE_SLUG;
  const ownKeys = await prisma.apiKey.count({ where: { storeId, revokedAt: null } });
  const envAppliesHere = envKeys > 0 && envSlug === storeSlug;
  const keyCount = ownKeys + (envAppliesHere ? envKeys : 0);
  const since = new Date(Date.now() - 30 * 86_400_000);

  const [recent, latest] = await Promise.all([
    prisma.order.count({ where: { storeId, channel: "ONLINE", status: { not: "CANCELLED" }, createdAt: { gte: since } } }),
    prisma.order.findFirst({ where: { storeId, channel: "ONLINE", status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, select: { orderNumber: true, createdAt: true } }),
  ]);

  let state: { tone: string; text: string };
  if (keyCount > 0) state = { tone: "bg-green-500", text: `On. ${keyCount} key${keyCount === 1 ? "" : "s"} accepted.` };
  else if (envKeys > 0) state = { tone: "bg-amber-500", text: envSlug ? `The keys in the server's .env book into another store (${envSlug}), not this one.` : "Keys in the server's .env need PUBLIC_API_STORE_SLUG, so the site cannot book. Create a key below instead." };
  else state = { tone: "bg-neutral-400", text: "Off. No API key exists yet." };

  return (
    <section className="card mb-6">
      <h2 className="mb-1 text-lg font-semibold">Website connection</h2>
      <p className="mb-3 text-sm text-neutral-500">
        A connected website books through THRICE and its bookings arrive as online orders.
      </p>
      <p className="flex items-center gap-2 text-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${state.tone}`} />
        {state.text}
      </p>
      <p className="mt-2 text-sm text-neutral-600">
        {recent} website order{recent === 1 ? "" : "s"} in the last 30 days.
        {latest && (
          <>
            {" "}
            Latest: #{latest.orderNumber}, {latest.createdAt.toLocaleString("en-GB", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" })}.
          </>
        )}
      </p>
    </section>
  );
}
