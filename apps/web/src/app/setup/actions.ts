"use server";

import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@thrice/db";
import { hashPassword } from "@thrice/shared";
import { login } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { setupCodeRequired } from "@/lib/setup-code";
import { loadDemoData } from "@/lib/demo-data";
import { logger } from "@/lib/logger";

const normalizeCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

function codesMatch(given: string, expected: string): boolean {
  const a = Buffer.from(normalizeCode(given));
  const b = Buffer.from(normalizeCode(expected));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export type SetupState = { error?: string };

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "store";

/** True once any store exists. Until then the first visitor sets the install up. */
export async function isSetUp(): Promise<boolean> {
  return (await prisma.store.count()) > 0;
}

export async function setupAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await checkRateLimit(`setup:${ip}`, 10, 15 * 60))) return { error: "Too many attempts. Try again in a few minutes." };

  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const storeName = text("storeName");
  const name = text("name");
  const email = text("email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const currency = text("currency").toUpperCase() || "USD";
  const timezone = text("timezone") || "UTC";

  const setupCode = text("setupCode");
  const needCode = setupCodeRequired();
  if (needCode && !setupCode) return { error: "Enter the setup code from the server log." };
  if (!storeName) return { error: "Enter your business name." };
  if (!name) return { error: "Enter your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 12) return { error: "Use a password of at least 12 characters." };
  if (password !== String(formData.get("confirm") ?? "")) return { error: "The two passwords do not match." };
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "Currency should be a three-letter code, such as USD." };
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    return { error: "That time zone is not recognised." };
  }

  const passwordHash = await hashPassword(password);
  const wantsDemo = formData.get("demo") === "on";
  const created = await prisma.$transaction(async (tx) => {
    // Serialise concurrent first visits, then refuse if someone already finished.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7305001)`;
    if ((await tx.store.count()) > 0) return false;
    if (needCode) {
      const stored = await tx.appSetting.findUnique({ where: { key: "setup_code" } });
      if (!stored || !codesMatch(setupCode, stored.value)) return "bad-code" as const;
    }
    const store = await tx.store.create({ data: { name: storeName, slug: slugify(storeName), currency, timezone } });
    const user = await tx.user.upsert({ where: { email }, update: { name, passwordHash }, create: { email, name, passwordHash } });
    await tx.storeMembership.create({ data: { storeId: store.id, userId: user.id, role: "OWNER" } });
    await tx.appSetting.deleteMany({ where: { key: "setup_code" } });
    return { storeId: store.id, userId: user.id };
  });
  if (created === "bad-code") return { error: "That setup code is not right. Look for it in the server log." };
  if (!created) redirect("/login");
  if (wantsDemo) {
    try {
      await loadDemoData(created.storeId, created.userId);
    } catch (err) {
      logger.error({ err }, "sample data failed at setup"); // the account exists; they can retry from Settings
    }
  }

  await login(email, password);
  redirect("/");
}
