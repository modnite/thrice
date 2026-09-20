"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@thrice/db";
import { requireSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { ensureWebsiteActor } from "@/lib/public-api";

export type AddressState = { error?: string; saved?: boolean };
export type CreateKeyState = { error?: string; key?: string; name?: string; url?: string };

async function adminContext() {
  const user = await requireSessionUser();
  const membership = await getCurrentStore(user);
  if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) return null;
  return { user, storeId: membership.storeId };
}

/** An http(s) address with no trailing slash, or null when blank. Throws on anything else. */
function parseAddress(raw: FormDataEntryValue | null, label: string): string | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`${label} is not a valid address.`);
  }
  if (!url.hostname) throw new Error(`${label} is not a valid address.`);
  return `${url.origin}${url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "")}`;
}

/** The address this request came in on, for when no public address has been saved yet. */
export async function detectOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  return `${proto}://${host}`;
}

export async function saveAddressesAction(_prev: AddressState, formData: FormData): Promise<AddressState> {
  const ctx = await adminContext();
  if (!ctx) return { error: "Only owners and admins can change integrations." };
  let publicUrl: string | null;
  let websiteUrl: string | null;
  try {
    publicUrl = parseAddress(formData.get("publicUrl"), "The THRICE address");
    websiteUrl = parseAddress(formData.get("websiteUrl"), "The website address");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Invalid address." };
  }
  await prisma.store.update({ where: { id: ctx.storeId }, data: { publicUrl, websiteUrl } });
  await prisma.auditLog.create({
    data: { storeId: ctx.storeId, userId: ctx.user.id, action: "INTEGRATION_ADDRESSES_UPDATED", entityType: "Store", entityId: ctx.storeId, diff: { publicUrl, websiteUrl } },
  });
  revalidatePath("/settings/integrations");
  return { saved: true };
}

export async function createApiKeyAction(_prev: CreateKeyState, formData: FormData): Promise<CreateKeyState> {
  const ctx = await adminContext();
  if (!ctx) return { error: "Only owners and admins can create API keys." };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the key a name, for example the website it is for." };
  if (name.length > 60) return { error: "Keep the name under 60 characters." };

  const key = `thr_${randomBytes(32).toString("base64url")}`;
  const created = await prisma.apiKey.create({
    data: { storeId: ctx.storeId, name, keyHash: createHash("sha256").update(key).digest("hex"), keyPrefix: key.slice(0, 8) },
    select: { id: true },
  });
  await ensureWebsiteActor();
  await prisma.auditLog.create({
    data: { storeId: ctx.storeId, userId: ctx.user.id, action: "API_KEY_CREATED", entityType: "ApiKey", entityId: created.id, diff: { name } },
  });

  const store = await prisma.store.findUniqueOrThrow({ where: { id: ctx.storeId }, select: { publicUrl: true } });
  revalidatePath("/settings/integrations");
  // The key is returned once, to this response only. It is not stored anywhere in readable form.
  return { key, name, url: store.publicUrl ?? (await detectOrigin()) ?? "" };
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const ctx = await adminContext();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  const key = await prisma.apiKey.findFirst({ where: { id, storeId: ctx.storeId, revokedAt: null }, select: { id: true, name: true } });
  if (!key) return;
  await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  await prisma.auditLog.create({
    data: { storeId: ctx.storeId, userId: ctx.user.id, action: "API_KEY_REVOKED", entityType: "ApiKey", entityId: key.id, diff: { name: key.name } },
  });
  revalidatePath("/settings/integrations");
}
