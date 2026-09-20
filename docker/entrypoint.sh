#!/bin/sh
# Used as the "migrate" service's command: runs database migrations once, then prints the first-run setup code if the
# site is not set up yet, then exits. app/worker start only after this completes successfully.
#
# The binaries are called directly rather than through `pnpm exec`: pnpm checks the npm registry when it starts, which
# fails on a network with no internet route (the database network in the stack).
set -e
cd "$(dirname "$0")/../packages/db"

echo "[migrate] running database migrations..."
node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma

# On a brand-new install this prints a one-time code that the first-run setup page asks for.
node_modules/.bin/tsx src/setup-code.ts

echo "[migrate] done."
