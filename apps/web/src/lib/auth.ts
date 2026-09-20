import "server-only";
import { cookies, headers } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@thrice/db";
import { verifyPassword } from "@thrice/shared";
import { logger } from "./logger";

const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  memberships: { storeId: string; role: "OWNER" | "ADMIN" | "STAFF"; storeName: string; storeSlug: string }[];
};

export async function login(email: string, password: string): Promise<SessionUser | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { memberships: { include: { store: true } } },
  });
  if (!user || !user.isActive) {
    logger.warn({ email: normalizedEmail }, "login failed: unknown or inactive user");
    return null;
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    logger.warn({ userId: user.id }, "login failed: bad password");
    return null;
  }

  logger.info({ userId: user.id }, "login succeeded");

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const cookieStore = await cookies();
  // Browsers drop Secure cookies on plain http, which would make login silently fail on a LAN box with no HTTPS.
  // So the cookie is Secure when the request came in over https (a proxy sets x-forwarded-proto), or always
  // when COOKIE_SECURE=true.
  const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : proto === "https";
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    memberships: user.memberships.map((m) => ({
      storeId: m.storeId,
      role: m.role,
      storeName: m.store.name,
      storeSlug: m.store.slug,
    })),
  };
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } }).catch(() => {});
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { memberships: { include: { store: true } } } } },
  });

  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    memberships: session.user.memberships.map((m) => ({
      storeId: m.storeId,
      role: m.role,
      storeName: m.store.name,
      storeSlug: m.store.slug,
    })),
  };
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/** Verifies the current user is a member of the given store and returns their role, or throws. */
export function requireStoreRole(
  user: SessionUser,
  storeId: string
): "OWNER" | "ADMIN" | "STAFF" {
  const membership = user.memberships.find((m) => m.storeId === storeId);
  if (!membership) throw new Error("FORBIDDEN");
  return membership.role;
}

/** Signs the user out everywhere except the browser making this request (used after a password change). */
export async function revokeOtherSessions(userId: string): Promise<number> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const result = await prisma.session.deleteMany({
    where: { userId, ...(token ? { tokenHash: { not: hashToken(token) } } : {}) },
  });
  return result.count;
}
