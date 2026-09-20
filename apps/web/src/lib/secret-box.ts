import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "@thrice/db";

/**
 * Encrypts small secrets (an email password, for example) before they go in the database, so they never sit there
 * as readable text and never come back to the browser.
 *
 * The key comes from APP_SECRET when the server sets one. Otherwise a random key is created once and kept in the
 * database. That still keeps the secret out of screens, exports and logs, but anyone holding the whole database
 * holds the key too. Set APP_SECRET (a long random value in .env) to keep the two apart.
 */
const KEY_SETTING = "secret_key";
let cached: Buffer | null = null;

async function getKey(): Promise<Buffer> {
  if (cached) return cached;
  const fromEnv = process.env.APP_SECRET?.trim();
  if (fromEnv) {
    cached = createHash("sha256").update(`thrice-secret-box:${fromEnv}`).digest();
    return cached;
  }
  let row = await prisma.appSetting.findUnique({ where: { key: KEY_SETTING } });
  if (!row) {
    try {
      row = await prisma.appSetting.create({ data: { key: KEY_SETTING, value: randomBytes(32).toString("base64") } });
    } catch {
      row = await prisma.appSetting.findUnique({ where: { key: KEY_SETTING } }); // created by a concurrent request
    }
  }
  if (!row) throw new Error("Could not create the encryption key.");
  cached = Buffer.from(row.value, "base64");
  return cached;
}

/** Returns "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export async function sealSecret(plain: string): Promise<string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await getKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** Returns the original text, or null if it cannot be read (wrong key, damaged value). */
export async function openSecret(sealed: string): Promise<string | null> {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", await getKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
