import "server-only";
import nodemailer from "nodemailer";
import { prisma } from "@thrice/db";
import { logger } from "./logger";
import { openSecret } from "./secret-box";

/** What is saved in Store.smtpConfig. The password is stored encrypted and is never sent back to the browser. */
export type SmtpConfig = {
  host: string;
  port: number;
  /** true = connect over SSL/TLS straight away (usually port 465). false = plain, upgraded with STARTTLS when offered (587). */
  secure: boolean;
  user?: string;
  passwordSealed?: string;
  from: string;
};

export type MailSource = "store" | "server" | "none";

type Resolved = { config: { host: string; port: number; secure: boolean; user?: string; password?: string; from: string }; source: Exclude<MailSource, "none"> };

/** The store's own settings if it has any, otherwise the server's SMTP_* settings, otherwise nothing. */
async function resolve(storeId: string): Promise<Resolved | null> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { smtpConfig: true } });
  const saved = store?.smtpConfig as SmtpConfig | null | undefined;
  if (saved?.host) {
    return {
      source: "store",
      config: {
        host: saved.host,
        port: saved.port,
        secure: saved.secure,
        user: saved.user,
        password: saved.passwordSealed ? ((await openSecret(saved.passwordSealed)) ?? undefined) : undefined,
        from: saved.from,
      },
    };
  }
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return {
    source: "server",
    config: {
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER || undefined,
      password: process.env.SMTP_PASSWORD,
      from: process.env.SMTP_FROM ?? "no-reply@example.com",
    },
  };
}

export async function mailSource(storeId: string): Promise<MailSource> {
  return (await resolve(storeId))?.source ?? "none";
}

const transport = (c: Resolved["config"]) =>
  nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: c.user ? { user: c.user, pass: c.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email isn't set up yet. Add your mail server under Settings > Integrations.");
  }
}

export async function sendEmail(storeId: string, to: string, subject: string, html: string): Promise<void> {
  const resolved = await resolve(storeId);
  if (!resolved) throw new EmailNotConfiguredError();
  try {
    await transport(resolved.config).sendMail({ from: resolved.config.from, to, subject, html });
  } catch (err) {
    logger.error({ err, to, subject }, "sendEmail failed");
    throw err;
  }
}

/** Turns a mail-server error into something a person can act on. */
export function explainMailError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; message?: string };
  if (e.code === "EAUTH" || e.responseCode === 535) return "The mail server refused the username or password.";
  if (e.code === "ECONNREFUSED") return "Could not connect. Check the server name and port.";
  if (e.code === "ENOTFOUND" || e.code === "EAI_AGAIN") return "That server name was not found.";
  if (e.code === "ETIMEDOUT" || e.code === "ESOCKET" || e.code === "ECONNECTION") return "The connection timed out or was dropped. Check the port and the SSL setting.";
  if (e.code === "EENVELOPE") return "The mail server did not accept the addresses. Check the From address.";
  return e.message ? `The mail server said: ${e.message}` : "The mail server could not be reached.";
}
