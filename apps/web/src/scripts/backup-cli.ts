/**
 * Backup and restore from the command line, for servers and scripts. Same file format as Settings > Data and backup.
 *
 *   docker compose exec -T worker sh -c "cd apps/web && node_modules/.bin/tsx src/scripts/backup-cli.ts export" > thrice-backup.json.gz
 *   docker compose exec -T worker sh -c "cd apps/web && node_modules/.bin/tsx src/scripts/backup-cli.ts restore" < thrice-backup.json.gz
 *
 * The backup goes to standard output and messages to standard error, so redirecting works. Restore reads standard input
 * and only works into an empty store. Set STORE_SLUG to pick a store when there is more than one.
 */
import { prisma } from "@thrice/db";
import { createBackup, parseBackup, restoreBackup } from "../lib/backup";

async function readStdin(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function main() {
  const command = process.argv[2];
  if (command !== "export" && command !== "restore") throw new Error("Usage: backup-cli.ts export | restore");
  const store = process.env.STORE_SLUG
    ? await prisma.store.findUniqueOrThrow({ where: { slug: process.env.STORE_SLUG }, select: { id: true, name: true } })
    : await prisma.store.findFirstOrThrow({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });

  if (command === "export") {
    const { file, counts } = await createBackup(store.id);
    process.stdout.write(file);
    console.error(`Backed up "${store.name}": ${JSON.stringify(counts)}`);
  } else {
    const backup = parseBackup(await readStdin());
    const counts = await restoreBackup(store.id, backup);
    console.error(`Restored "${backup.storeName}" into "${store.name}": ${JSON.stringify(counts)}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
