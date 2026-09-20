FROM node:22-alpine AS base
# Installed directly (pinned) rather than via `corepack enable`, which tries
# to resolve/lock its own "packageManagerDependencies" against the lockfile
# and fails frozen-lockfile installs in a clean container.
RUN npm install -g pnpm@12.4.2
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/importer/package.json packages/importer/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @thrice/db generate
RUN pnpm --filter web build

# ---- runtime image, shared by the web app, the worker and the one-off migrate job ----
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /repo

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Next.js standalone server (traced, minimal deps for the web process)
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public

# Full node_modules + source for the worker/migrate/seed processes, which run
# via `pnpm exec` (not part of the Next.js standalone trace). pnpm's per-package
# node_modules/.bin symlinks point back into the root .pnpm store, so both are
# needed together.
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/pnpm-workspace.yaml /repo/package.json ./
COPY --from=build /repo/packages/db ./packages/db
COPY --from=build /repo/packages/shared ./packages/shared
COPY --from=build /repo/packages/importer ./packages/importer
COPY --from=build /repo/apps/web/src ./apps/web/src
COPY --from=build /repo/apps/web/package.json ./apps/web/package.json
COPY --from=build /repo/apps/web/node_modules ./apps/web/node_modules

# The start-up job's script travels inside the image, so a pulled image is complete on its own.
COPY --from=build /repo/docker/entrypoint.sh ./docker/entrypoint.sh

RUN chown -R nextjs:nodejs /repo
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
