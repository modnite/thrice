import { randomInt } from "node:crypto";
import { prisma } from "@thrice/db";
import { logger } from "./logger";

const KEY = "setup_code";
// No 0/O, 1/I/L: the code is read off a screen and typed.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Makes sure a one-time setup code exists while the install has no owner yet. The start-up job normally creates
 * and prints it; this covers installs started another way (for example plain `pnpm dev`) by creating it here and
 * writing it to the server log.
 */
export async function ensureSetupCode(): Promise<void> {
  if (await prisma.appSetting.findUnique({ where: { key: KEY } })) return;
  const pick = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const code = `${pick()}-${pick()}`;
  try {
    await prisma.appSetting.create({ data: { key: KEY, value: code } });
  } catch {
    return; // another request created it first
  }
  logger.warn(`THRICE first-run setup code: ${code}`);
  console.log(`\nTHRICE first-run setup code: ${code}\n`);
}
