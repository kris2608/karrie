# Shared-list commercial photo restore

## Confirmed root causes

1. `toImportSavedItems` forced `imageChoice: drawing` on every imported row.
2. `ItemArt.pickArt` returns no photo when choice is `drawing`, so PrijsProfeet/OFF/name hits never showed.
3. Import dropped `source` / recognition, so `identityOf` treated branded packs as generic.
4. `shareableProductId` only kept ids present in the sender’s in-memory catalog; central PG shapes were dropped.
5. Parent `photoId` blobs were correctly never shared (device-local).

## What we changed

- Import: generics stay on drawings; EAN/brand items omit `imageChoice` and set `source` to `barcode` or `shared`.
- `identityOf` treats `source: shared` + brand as branded.
- Share/import keep catalog-shaped ids (`kebab`, `b-` / `n-` / `pl-` / `c-`) and optional `variant`; strip `photo:` / `shared:` / UUIDs.
- Server sanitizes the same way and drops productIds unknown to `catalog_products` when the DB is available.
- Background barcode hydrate (`apply-shared-pack`) attaches trusted OFF `imageUrl` after import; existing `storeImages` handles retailer links once drawing is unlocked.
- Legacy lists: `normalizeSharedImageChoice` on hydrate / open-saved clears drawing locks when EAN or brand is present.
- Share UI: personal photos stay on this device; commercial OFF/store photos may reload for the recipient.

## What stays device-local

Parent photos (`photoId` and local blobs). No personal photo upload, no shared image hosting, no by-id image API.

## API / DB

No migration. Additive share field `variant`. Optional `SELECT` against existing `catalog_products` during share create.
