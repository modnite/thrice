"use server";

import { prisma } from "@thrice/db";
import { hashPassword, verifyPassword } from "@thrice/shared";
import { requireSessionUser, revokeOtherSessions } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export type AccountState = { error?: string; message?: string };

const MIN_PASSWORD_LENGTH = 12;

export async function changePasswordAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await requireSessionUser();

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < MIN_PASSWORD_LENGTH) return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (next.length > 200) return { error: "That password is too long." };
  if (next !== confirm) return { error: "The two new passwords don't match." };
  if (next === current) return { error: "Choose a password you haven't used just now." };

  // Someone with a stolen session could otherwise guess the current password freely.
  const allowed = await checkRateLimit(`change-password:${user.id}`, 5, 15 * 60);
  if (!allowed) return { error: "Too many attempts. Try again in a few minutes." };

  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(row.passwordHash, current))) return { error: "Your current password is wrong." };

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  const signedOut = await revokeOtherSessions(user.id);
  const first = user.memberships[0];
  if (first) {
    await prisma.auditLog.create({
      data: { storeId: first.storeId, userId: user.id, action: "PASSWORD_CHANGED", entityType: "User", entityId: user.id },
    });
  }
  return {
    message:
      signedOut > 0
        ? `Password changed. ${signedOut} other session${signedOut === 1 ? " was" : "s were"} signed out.`
        : "Password changed.",
  };
}
