import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@thrice/db";
import { checkRateLimit } from "./rate-limit";
import { getVariantAvailability } from "./availability";
import { logger } from "./logger";

/**
 * Public API v1: a small, server-to-server surface for a customer-facing website to read availability and
 * prices and to create or cancel website bookings. It reuses the same availability, pricing and order-creation
 * engine staff use, so a website booking can never disagree with, or bypass, the rules staff bookings follow.
 *
 * Keys are created in Settings > Integrations and stored as SHA-256 digests (the key is shown once). Keys set in
 * the environment still work, for installs that predate that page:
 *   PUBLIC_API_KEY_HASHES   comma-separated SHA-256 hex digests of accepted keys
 *   PUBLIC_API_STORE_SLUG   the store those keys book into
 *   PUBLIC_API_ACTOR_EMAIL  the non-login "website" user shown in the audit log (default website@thrice.local)
 * With no key anywhere, every route answers 404: the API is off by default.
 */

export const WEBSITE_NOTE_PREFIX = "Website booking";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function apiError(status: number, code: string, message: string) {
  return json({ error: { code, message } }, status);
}

const sha256 = (v: string) => createHash("sha256").update(v).digest();

function acceptedHashes(): Buffer[] {
  return (process.env.PUBLIC_API_KEY_HASHES ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[0-9a-f]{64}$/.test(h))
    .map((h) => Buffer.from(h, "hex"));
}

/** The non-login user that website bookings are recorded under. Created on first use. */
export async function ensureWebsiteActor(): Promise<string> {
  const email = process.env.PUBLIC_API_ACTOR_EMAIL ?? "website@thrice.local";
  const user = await prisma.user.upsert({
    where: { email },
    // isActive=false and an unusable hash: this account can never sign in. It only authors audit entries.
    create: { email, name: "Website (public API)", passwordHash: "disabled", isActive: false },
    update: {},
    select: { id: true },
  });
  return user.id;
}

export type PublicContext = { storeId: string; actorUserId: string; keyId: string };

/**
 * Authenticates a request. Returns the context, or a ready-made error response.
 * Keys are matched by SHA-256 digest (constant time for environment keys), and every failure looks the same.
 */
export async function authenticate(req: Request): Promise<PublicContext | NextResponse> {
  const envHashes = acceptedHashes();
  const match = /^Bearer\s+(\S{20,200})$/.exec(req.headers.get("authorization") ?? "");

  const nothingConfigured = async () => envHashes.length === 0 && (await prisma.apiKey.count({ where: { revokedAt: null } })) === 0;
  if (!match) {
    if (await nothingConfigured()) return apiError(404, "NOT_FOUND", "Not found.");
    return apiError(401, "UNAUTHENTICATED", "Missing or malformed API key.");
  }

  const presented = sha256(match[1]!);
  let storeId: string | null = null;
  let keyId: string | null = null;

  const stored = await prisma.apiKey.findFirst({ where: { keyHash: presented.toString("hex"), revokedAt: null }, select: { id: true, storeId: true, lastUsedAt: true } });
  if (stored) {
    storeId = stored.storeId;
    keyId = stored.id;
    // Keep "last used" roughly current without a write on every request.
    if (!stored.lastUsedAt || Date.now() - stored.lastUsedAt.getTime() > 60_000) {
      prisma.apiKey.update({ where: { id: stored.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    }
  } else {
    const index = envHashes.findIndex((h) => timingSafeEqual(h, presented));
    if (index === -1) {
      if (await nothingConfigured()) return apiError(404, "NOT_FOUND", "Not found.");
      logger.warn({ ip: req.headers.get("x-forwarded-for") ?? "unknown" }, "public api: rejected key");
      return apiError(401, "UNAUTHENTICATED", "Missing or malformed API key.");
    }
    keyId = `env${index + 1}`;
    const slug = process.env.PUBLIC_API_STORE_SLUG;
    if (!slug) return apiError(503, "NOT_CONFIGURED", "PUBLIC_API_STORE_SLUG is not set.");
    const store = await prisma.store.findUnique({ where: { slug }, select: { id: true } });
    if (!store) return apiError(503, "NOT_CONFIGURED", "The configured store does not exist.");
    storeId = store.id;
  }

  if (!(await checkRateLimit(`publicapi:${keyId}`, 240, 60))) return apiError(429, "RATE_LIMITED", "Too many requests.");

  return { storeId, actorUserId: await ensureWebsiteActor(), keyId };
}

export const isResponse = (v: unknown): v is NextResponse => v instanceof NextResponse;

/** ISO 8601 instant, or null. */
export function parseInstant(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Intervals inside [from, to] when the variant cannot be booked. Candidates are the windows of orders that
 * hold the variant's resources; each is kept only if the real availability engine says nothing is free for it.
 * Exact for a single physical unit such as the studio; for multi-unit stock the create call remains the
 * final authority, so at worst a customer is told "just taken" rather than being double-booked.
 */
export async function busyIntervals(storeId: string, variantId: string, from: Date, to: Date) {
  const slots = await prisma.variantResourceSlot.findMany({ where: { variantId }, include: { options: true } });
  const skuIds = [...new Set(slots.flatMap((s) => s.options.map((o) => o.skuId)))];
  if (skuIds.length === 0) return [];

  const now = new Date();
  const orders = await prisma.order.findMany({
    where: {
      storeId,
      status: { in: ["UPCOMING", "ACTIVE"] },
      startAt: { lt: to },
      // An Active order past its return time still holds its stock, so it stays a candidate.
      OR: [{ endAt: { gt: from } }, { status: "ACTIVE" }],
      bookings: { some: { lines: { some: { skuId: { in: skuIds } } } } },
    },
    select: { startAt: true, endAt: true, status: true },
    orderBy: { startAt: "asc" },
    take: 200,
  });

  const out: { start: Date; end: Date }[] = [];
  for (const o of orders) {
    const start = o.startAt;
    const end = o.status === "ACTIVE" && o.endAt < now ? now : o.endAt;
    if (end <= from || start >= to) continue;
    const a = await getVariantAvailability(storeId, variantId, start, end);
    if (a.available < 1) out.push({ start, end });
  }
  return out;
}
