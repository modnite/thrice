/**
 * First-run setup code.
 *
 * A brand-new install has no owner, so the first visitor to the site would get to claim it. To stop a stranger
 * who finds the address first, the setup page asks for a one-time code that is only printed in the server's own
 * logs (`docker compose logs migrate`). Once the owner exists the code is deleted.
 *
 * Runs on every start: prints the code while the site is not set up, and cleans up after it is.
 */
import { randomInt } from "node:crypto";
import { prisma } from "./index.js";

const KEY = "setup_code";
// No 0/O, 1/I/L: the code is read off a screen and typed.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const makeCode = () => {
  const pick = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${pick()}-${pick()}`;
};

async function main() {
  if ((await prisma.store.count()) > 0) {
    await prisma.appSetting.deleteMany({ where: { key: KEY } });
    return;
  }
  const existing = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const code = existing?.value ?? makeCode();
  if (!existing) await prisma.appSetting.create({ data: { key: KEY, value: code } });

  const line = "=".repeat(52);
  console.log(`\n${line}\n  THRICE is ready to be set up.\n  Open the site and enter this setup code:\n\n      ${code}\n\n  It works once, and only until the owner exists.\n${line}\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
