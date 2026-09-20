import "server-only";
import { cookies } from "next/headers";
import type { SessionUser } from "./auth";

const STORE_COOKIE = "store_id";

export async function getCurrentStore(user: SessionUser) {
  const cookieStore = await cookies();
  const requested = cookieStore.get(STORE_COOKIE)?.value;
  const membership = requested
    ? (user.memberships.find((m) => m.storeId === requested) ?? user.memberships[0])
    : user.memberships[0];
  return membership ?? null;
}

export async function setCurrentStore(storeId: string) {
  const cookieStore = await cookies();
  cookieStore.set(STORE_COOKIE, storeId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
