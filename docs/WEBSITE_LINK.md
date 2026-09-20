# Linking a website to THRICE in production

A customer-facing website books through THRICE's public API. Every website booking arrives in THRICE as an online order. THRICE decides prices and conflicts. The website never tells a customer "confirmed" until THRICE agrees.

The API itself is described in `PUBLIC_API.md`. This page is the go-live checklist.

## What must be true first

- THRICE runs on a server with an address the website can reach. `DEPLOY.md` shows how. When both run in the same stack the website reaches THRICE over the private network and no public address is needed.
- Whatever the website books exists in THRICE as a product with a variant, a rate for the durations you sell, and stock. For a bookable space, make the space a SKU with one tracked article.

## Steps

1. **Products.** Create or check the products in Catalog and note the hourly or daily rates.
2. **Key.** In **Settings > Integrations** save THRICE's address and create an API key named for the website. Copy the two lines it shows. The key is shown once and THRICE keeps only its hash.
3. **Website.** Give the website those two lines as `THRICE_API_URL` and `THRICE_API_KEY`, and tell it to use THRICE. Then give it each product's ID and variant ID. The Integrations page has a search that shows them.
4. **Check.** In THRICE open Settings > Integrations and look at **Website connection**. It should say On. Book a test slot on the website and confirm the order appears in THRICE, then cancel it.

## Keeping it safe

- The key only allows availability, quotes and creating or cancelling website orders. It can only cancel orders the website itself created. It cannot read customers or other orders.
- Never paste the key into chat or a ticket. If it leaks, create a new key, update the website, then revoke the old one.
- To switch the link off at once, revoke the key in Settings > Integrations.

## When something looks wrong

| Symptom | Likely cause |
| --- | --- |
| Website connection says "Off" | No key exists or every key was revoked |
| Website says the time is unavailable | The slot is taken in THRICE. Check Orders for that time |
| Website cannot reach THRICE | Wrong `THRICE_API_URL`, or a proxy blocks `/api/public/v1/` |
| Prices differ from the website | The website shows its own rate. THRICE's rate wins on the order |

Website orders show as "Via online store" in THRICE, with a note that starts with `Website booking`.
