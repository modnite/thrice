# Public API v1 (for the customer-facing website)

A small server-to-server API so a customer-facing website can read availability and prices and create or cancel
website bookings in THRICE. It is **off until you configure a key**, adds **no database tables**, and reuses the same
availability, pricing and order engine staff use, so a website booking follows exactly the same rules.

Code: `apps/web/src/app/api/public/v1/*`, `apps/web/src/lib/public-api.ts`. Contract: `docs/reference/public-api-v1.openapi.yml`.

## Turn it on

Open **Settings > Integrations** as an owner or admin.

1. Save this THRICE's public address (and optionally the website's address).
2. Create an API key. It is shown once, together with the two lines the website needs: `THRICE_API_URL` and `THRICE_API_KEY`. THRICE keeps only a hash of the key.
3. Use **Find product IDs** on the same page to copy the product and variant IDs the website books.

**Revoke a key:** press Revoke next to it. It stops working at once.
**Rotate a key:** create a new one, update the website, then revoke the old one.
**Turn it off:** revoke every key. With no key, every route answers 404.

Servers set up before that page existed can keep using the older environment variables `PUBLIC_API_KEY_HASHES` and `PUBLIC_API_STORE_SLUG`. They still work alongside keys made in Settings.

## Catalogue setup

Each thing the website books needs a product in THRICE with a variant, a rate for the durations you sell, and stock.
For a bookable space such as a studio room, make the room a SKU with one tracked article and give each package its own
variant with that same SKU in its slot, so a booking of one blocks the others. Then give the website each product's ID
and variant ID (Settings > Integrations has a search that shows them).

## Endpoints

All require `Authorization: Bearer <key>`. Errors are `{ "error": { "code", "message" } }`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/public/v1/health` | Key, store and service user are configured |
| GET | `/api/public/v1/availability?productId&variantId&from&to` | `{ busy: [{start,end}] }` inside the window (max 120 days) |
| GET | `/api/public/v1/quote?variantId&start&end` | `{ amount, currency }` priced by THRICE's rate engine |
| POST | `/api/public/v1/orders` | Create an `ONLINE` order. `201` new, `200` if the `reference` already exists, `409` slot taken |
| DELETE | `/api/public/v1/orders/:id` | Cancel a website order that is still `UPCOMING`. `204` |

## Behaviour worth knowing

- **Idempotent create.** `reference` (the website's `AIS-XXXXXX`) is stored in the order notes. Repeating a request returns the original order.
- **Conflicts are decided by THRICE.** Order creation is the existing transactional engine; six simultaneous requests for one slot produce one order and five `409`s.
- **Opening hours.** Website orders are created with `allowOutsideHours`, because the website enforces the studio's own hours per package. The store's pickup hours (for equipment) do not apply.
- **Cancel is narrow.** Only `ONLINE` orders whose notes start with `Website booking` and are still `UPCOMING`. It can never touch a staff order.
- **Audit.** Every website action is recorded as `website@thrice.local`.
- **Rate limit.** 240 requests per minute per key.

## What it deliberately does not do

No payments, no customer login, no reading customers or orders. Deposits and payment are handled by staff in THRICE as usual.
