# Shared product catalog — developer report

## Schema
- `categories`, `catalog_products`, `catalog_aliases`, `product_variants`, `product_identifiers`, `product_images`, `product_facts`, `lookup_cache`, plus existing `candidates`.
- Versioned via `schema_migrations` (`001_candidates`, `002_catalog`).
- Shared pool: `CANDIDATES_DATABASE_URL` → one `createPgPool` for candidates and catalog.

## Data flow
1. Scan → client IndexedDB → `POST /api/products/barcode` → memory cache → Postgres GTIN → Open Food Facts / web page → persist product, variant, GTIN, facts, image.
2. Name image → catalog alias (pack-aware) → PrijsProfeet / OFF → persist images as `cc_by_sa` or `link_only` (never download retailer photos; never store EAN from name match).
3. Candidate approve → linked `catalog_products` (not default) → admin can set default → devices pull `GET /api/catalog/changes`.

## Tests
- Server: 184 tests green (incl. 13 catalog scenarios + bootstrap parity).
- Client: 269 tests green (incl. sync merge / artIdOf).
- `tsc` (server + client) and production builds succeed.

## Live restart persistence
Not claimed yet. After deploy with Postgres:
1. Look up an EAN once (expect Open Food Facts).
2. Restart `karrie-api` on Render.
3. Look up the same EAN again; `/api/health` → `catalog.centralHits` should increase and the response should be served without a fresh OFF miss storm.

## Postponed
- Storing EANs discovered during name search (needs validation gate).
- Field-level provenance (kept per row: source, URL, license, retrieved_at).
