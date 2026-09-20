/**
 * One-time setup for the public API. Creates the non-login "website" service user (used only so website
 * bookings show up in the audit log under a clear name) and prints a new API key plus its hash.
 *
 *   docker compose exec worker pnpm --filter web exec tsx src/scripts/public-api-setup.ts
 *
 * Put the printed PUBLIC_API_KEY_HASHES / PUBLIC_API_STORE_SLUG lines in THRICE's .env, restart the app, and give
 * the printed KEY (once) to the website as THRICE_API_KEY. THRICE keeps only the hash, never the key.
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@thrice/db";

async function main() {
  const email = process.env.PUBLIC_API_ACTOR_EMAIL ?? "website@thrice.local";
  const slug = process.env.PUBLIC_API_STORE_SLUG ?? (await prisma.store.findFirstOrThrow({ orderBy: { createdAt: "asc" }, select: { slug: true } })).slug;
  const store = await prisma.store.findUniqueOrThrow({ where: { slug }, select: { id: true, name: true } });

  // isActive=false and an unusable hash: this account can never sign in. It exists only as an audit-log author.
  await prisma.user.upsert({
    where: { email },
    create: { email, name: "Website (public API)", passwordHash: "disabled", isActive: false },
    update: {},
  });

  const key = `thr_${randomBytes(32).toString("base64url")}`;
  const hash = createHash("sha256").update(key).digest("hex");

  console.log(`\nStore: ${store.name} (${slug})\nService user: ${email}\n`);
  console.log("Add to THRICE's .env, then restart the app (comma-separate several hashes to rotate keys):\n");
  console.log(`PUBLIC_API_STORE_SLUG=${slug}`);
  console.log(`PUBLIC_API_KEY_HASHES=${hash}\n`);
  console.log("Give this to the website as THRICE_API_KEY. It is shown once and not stored anywhere:\n");
  console.log(`${key}\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
