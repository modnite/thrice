/**
 * Locked out? Sets a new random password for an account and signs it out everywhere.
 * Run it on the server, where only someone with server access can:
 *
 *   docker compose exec worker pnpm --filter web exec tsx src/scripts/reset-password.ts owner@example.com
 *
 * It prints the new password once. Sign in with it, then change it under Account.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "@thrice/db";
import { hashPassword } from "@thrice/shared";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: reset-password.ts <email>");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, isActive: true } });
  if (!user || !user.isActive) throw new Error(`No active account for ${email}.`);

  const password = randomBytes(12).toString("base64url");
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);
  console.log(`\nNew password for ${email}:\n\n  ${password}\n\nSign in with it, then change it under Account.\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
