# THRICE — self-hosted rental commerce backend (a TWICE clone, minus the wait)

Admin backend for a rental business: catalog (categories/products/SKUs/articles), a
booking/availability engine, orders (Upcoming/Active/Completed), customers, and a CSV
importer that migrates directly from TWICE Commerce's own admin exports.

## Features

- **Orders**: Upcoming, Active and Completed tabs with filters, a column-based filter builder,
  sortable columns, row selection and CSV export. The order page is one card per person with one
  row per item and a serial (ID) picker scoped to units that are actually free.
- **Order import**: orders can be loaded from a spreadsheet (Orders > Import orders) keeping their numbers,
  dates, serial numbers and payment status. A "check" run tests everything and then undoes it.
- **Order lifecycle**: orders never roll over on the clock. Staff press Start and End (or end
  each person's items separately), and the real times are recorded. Cancel start, Re-open,
  Duplicate, reschedule (Select start date) and add or remove people are all supported. An
  Active order past its return time shows as late and keeps holding its stock.
- **Availability**: capacity-aware per SKU (individually tracked or bulk), bundle variants with
  alternative SKUs, and warnings for conflicts that appear later (an item marked lost, a serial
  booked twice, bulk stock oversold).
- **Pricing**: duration-based rates per variant following TWICE's documented rule (longest row that
  fits, remainder filled with shorter rows, optional additional price for repeat blocks; see
  `packages/shared/src/pricing.ts`), measured either by elapsed time or by calendar days touched
  ("Starting at"), or one flat price. Rates can be bulk edited as a spreadsheet (Catalog > Products > Import or
  export rates). Prices are always computed
  on the server. Manage them under Catalog > Products > Pricing.
- **Payments and deposits**: paid or unpaid, a per-order payment method (methods and their
  descriptions are set in Settings), and manual security deposits (pending, held, released or
  captured with a reason).
- **Store settings**: contact details for invoices, opening hours (pickup and return are checked
  against them), and the wording of the confirmation email. Emails need `SMTP_*` in `.env`.
- **Team and accounts**: owners and admins add staff, change roles, reset passwords and remove
  access (Settings > Manage team). Staff can run orders and inventory. The Customers and Catalog
  sections, settings and the team page are hidden from staff and blocked on the server. Everyone can change their own password (click your initials), which signs their
  other sessions out.
- **Customers and stock**: a customer list with order history, and stock item management
  (add, mark in use, out of use or lost, delete items that were never on an order).
- **Print**: a printable order confirmation with a Code 128 barcode.
- **Home**: today's pickups and returns, late returns, unpaid orders, stock conflicts and deposits
  still to resolve.

Not built: Sale, Subscription and Buyback orders (the type exists as a label only), card
authorization holds through a payment gateway.

## Stack

Next.js (App Router) + TypeScript, Postgres via Prisma, Redis + BullMQ for background
jobs, all dockerized. Monorepo: `apps/web` (UI + API), `packages/db` (schema/migrations),
`packages/importer` (CSV migration), `packages/shared` (validation/utilities).

## Local development (without Docker)

Requires Node 20+, pnpm, and a local Postgres + Redis (or point `DATABASE_URL`/`REDIS_URL`
at any reachable instance).

```bash
pnpm install
cp .env.example .env   # fill in DATABASE_URL and REDIS_URL
pnpm db:migrate
pnpm db:setup-code   # prints the code the first-run setup page asks for
pnpm dev
```

## Running with Docker Compose

```bash
cp .env.example .env      # change POSTGRES_PASSWORD
docker compose up -d --build
```

Open `http://localhost:3000`. The first visit shows a setup page. It asks for a one-time setup code, which is printed in the server log (`docker compose logs migrate`), then for your business name and the owner account. Accounts and business details live in the database. Nothing about them is in `.env`.

`docs/DEPLOY.md` covers a home or office server (OpenMediaVault), a public server on Hetzner with automatic HTTPS, and backups.

### Local dev via Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Migrating from TWICE

1. In TWICE admin, export Categories, Products, SKUs and Articles as CSV (the same
   exports this repo's importer was built against — semicolon-delimited).
2. Log into this app, go to **Inventory → Import CSV**.
3. Upload the four files (order doesn't matter in the form; they're processed
   Categories → Products → SKUs → Articles internally) and run the import.
4. Re-running with a fresher export is safe — rows are upserted on natural keys
   (category name, SKU code, article code), so nothing is duplicated.

Each run is logged under **Inventory → Import CSV → Recent import runs** with
created/updated/skipped/errored counts, so a partial or failed migration is debuggable.

## Connecting a website

A customer-facing website can book through THRICE's public API. Its bookings arrive as online orders and follow the same availability, pricing and opening-hours rules as staff bookings. Keys and addresses are set in **Settings > Integrations**. The API is described in `docs/PUBLIC_API.md` and the go-live checklist is `docs/WEBSITE_LINK.md`.

## Sample data, backup and restore in the app

- **Sample data:** on the setup page, or under **Settings > Data and backup** while the store is empty, THRICE can fill itself with a made-up outdoor-gear rental business (catalog, rates, stock, customers and orders in every state) so you can try everything.
- **Backup file:** **Settings > Data and backup > Download backup** gives one file with your settings, catalog, rates, stock, customers, orders and audit trail. It leaves out accounts, passwords, API keys and the email password.
- **Restore:** the same page restores a backup into an empty store, for example a fresh install. Every id is kept, so nothing that points at something else is lost. This is how to move a demo or test setup to a live install.
- **From the command line:** `backup-cli.ts export > file` and `backup-cli.ts restore < file` do the same on a server (see the header of `apps/web/src/scripts/backup-cli.ts`).

The nightly database dump from the stack is still what recovers a whole server. The backup file is for moving business data between installs.

## Backup & restore of the database

The `backup` service writes a compressed database dump to the `backups` volume every 24 hours
and keeps 14 days (`BACKUP_INTERVAL_HOURS` and `BACKUP_KEEP_DAYS` in `.env` change that).
Check it with `docker compose logs backup`. A backup that lives only on the same machine is
not a real backup, so copy it off regularly:

```bash
docker compose cp backup:/backups ./offsite-backups
```

Manual backup and restore:

```bash
# Backup
docker compose exec postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB | gzip > backup.sql.gz

# Restore
gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U $POSTGRES_USER $POSTGRES_DB
```

Take a backup before every migration/import run until you trust the pipeline.

## Security notes

- Sessions are server-side (hashed token in Postgres), HTTP-only cookies — never
  JWTs in localStorage.
- Passwords hashed with scrypt (Node's built-in `crypto.scrypt`, random salt per
  password, timing-safe comparison) — no native binary dependency, so it behaves
  identically across every platform this runs on.
- All API/server-action inputs validated with Zod.
- Every DB access goes through Prisma (parameterized); the one raw-SQL spot
  (booking overlap query) uses parameterized `$queryRaw`, never string
  concatenation.
- Rate limiting on login (Redis-backed, fails open if Redis is down rather than
  taking the app offline).
- RBAC (OWNER/ADMIN/STAFF per store) is enforced server-side on mutating actions,
  not just hidden in the UI.

## Tests

```bash
pnpm test
```

Covers the CSV importer (against your real anonymized-free export fixtures under
`packages/importer/__fixtures__`) and the availability/overlap logic.

## Licence

THRICE is free software under the GNU Affero General Public License v3.0 (see `LICENSE`). You can use, study, change and share it. If you run a modified version as a service for other people, the AGPL requires you to offer them the source of your changes.

The THRICE name and logo are not covered by the licence.
