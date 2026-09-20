"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@thrice/db";
import { requireSessionUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/current-store";
import { EmailNotConfiguredError, explainMailError, sendEmail, type SmtpConfig } from "@/lib/mailer";
import { sealSecret } from "@/lib/secret-box";

export type EmailState = { error?: string; saved?: boolean; message?: string };

async function adminContext() {
  const user = await requireSessionUser();
  const membership = await getCurrentStore(user);
  if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) return null;
  return { user, storeId: membership.storeId };
}

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function saveEmailSettingsAction(_prev: EmailState, formData: FormData): Promise<EmailState> {
  const ctx = await adminContext();
  if (!ctx) return { error: "Only owners and admins can change email settings." };

  const host = text(formData, "host").toLowerCase();
  const port = Number(text(formData, "port"));
  const secure = text(formData, "security") === "ssl";
  const user = text(formData, "user");
  const password = String(formData.get("password") ?? "");
  const from = text(formData, "from");

  if (!host || /[\s/]/.test(host)) return { error: "Enter the mail server name, for example smtp.gmail.com." };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: "Enter a port between 1 and 65535 (587 is the usual one)." };
  if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$|^.+<[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>$/.test(from)) return { error: "Enter the address emails are sent from, for example orders@yourshop.com." };

  const row = await prisma.store.findUniqueOrThrow({ where: { id: ctx.storeId }, select: { smtpConfig: true } });
  const previous = row.smtpConfig as SmtpConfig | null;

  // A blank password box keeps the saved password. Clearing the username drops it along with the password.
  let passwordSealed: string | undefined;
  if (user) {
    if (password) passwordSealed = await sealSecret(password);
    else passwordSealed = previous?.passwordSealed;
    if (!passwordSealed) return { error: "Enter the password for that username." };
  }

  const config: SmtpConfig = { host, port, secure, from, ...(user ? { user, passwordSealed } : {}) };
  await prisma.store.update({ where: { id: ctx.storeId }, data: { smtpConfig: config } });
  await prisma.auditLog.create({
    data: { storeId: ctx.storeId, userId: ctx.user.id, action: "EMAIL_SETTINGS_UPDATED", entityType: "Store", entityId: ctx.storeId, diff: { host, port, secure, user: user || null, from, passwordChanged: !!password } },
  });
  revalidatePath("/settings/integrations");
  return { saved: true };
}

export async function sendTestEmailAction(_prev: EmailState): Promise<EmailState> {
  const ctx = await adminContext();
  if (!ctx) return { error: "Only owners and admins can send a test email." };
  const to = ctx.user.email;
  try {
    await sendEmail(ctx.storeId, to, "THRICE test email", "<p>This is a test from THRICE. If you can read it, your email settings work.</p>");
    return { message: `Sent to ${to}. Check that inbox, and the spam folder.` };
  } catch (err) {
    if (err instanceof EmailNotConfiguredError) return { error: err.message };
    return { error: explainMailError(err) };
  }
}

export async function clearEmailSettingsAction(): Promise<void> {
  const ctx = await adminContext();
  if (!ctx) return;
  await prisma.store.update({ where: { id: ctx.storeId }, data: { smtpConfig: Prisma.DbNull } });
  await prisma.auditLog.create({
    data: { storeId: ctx.storeId, userId: ctx.user.id, action: "EMAIL_SETTINGS_REMOVED", entityType: "Store", entityId: ctx.storeId, diff: {} },
  });
  revalidatePath("/settings/integrations");
}
