# Karrie product analytics (Umami)

Karrie uses **Umami Cloud** only (no separate analytics database, no user accounts, no persistent event queue across sessions). Events carry fixed names, enums and counts — never product names, EANs, list names, photos, share tokens or child identifiers.

Anonymous funnels **cannot** reliably link activity across devices or browser profiles. Treat reports as process-level signals, not verified “families”.

## Privacy guards (already in the app)

- Tracker injected on **production builds** only (`vite.config.ts`), limited to `karrie.eu`, `www.karrie.eu`, `karrieapp.onrender.com`.
- `data-do-not-track`, `data-exclude-search`, `data-exclude-hash`.
- Share paths `/l/{token}` and `/s/{token}` rewritten to `/l` or `/s` before pageviews leave the device.
- Custom events never include tokens, EANs or free text.

## Report A — Shopping funnel

Compare counts (same date range) for:

1. `new_adventure_clicked`
2. `shopping_list_created`
3. `adventure_started`
4. `adventure_first_item_found` (property `item_count`)
5. `adventure_completed` (properties `item_count`, `completed_missions`)

Also available: `first_adventure_started`, `first_adventure_completed` (lifetime milestones per browser profile).

**Purpose:** see where people stop between starting a list and finishing a shop.

## Report B — Recognition quality

Compare:

- `scanner_opened`
- `scanner_result` → break down by `method` (`barcode` | `photo`) and `outcome` (`success` | `not_found` | `error` | `offline`)
- `barcode_lookup_result` → break down by `source` and `outcome`

`source` values (confirmed pathway only):

| Source | Meaning |
|--------|---------|
| `device_cache` | IndexedDB on the phone |
| `server_cache` | In-memory cache on the API |
| `postgres` | Central product catalog |
| `open_food_facts` | Fresh OFF lookup |
| `prijsprofeet` | PrijsProfeet identity win |
| `web_search` | Web page that prints the EAN |
| `my_products` | Parent-confirmed “Mijn producten” |

`outcome`: `success` | `not_found` | `error` | `offline` | `rate_limited`

**Purpose:** scanner reliability and how often Postgres avoids external lookups.

## Report C — Bonus engagement

By `kind` (`healthier` | `guess` | `color` | `drag`):

- `bonus_offered`
- Completion: `bonus_mission_completed` (healthier) or `bonus_play_completed` (mini-games)
- `bonus_skipped`

**Purpose:** which games are actually shown and finished, not only implemented.

## Report D — Sharing funnel

Compare:

1. `shopping_list_share_opened`
2. `shopping_list_shared` (`method`: `native` | `copied`)
3. `shared_list_open_result` (`outcome`: `preview` | `expired` | `invalid` | `network_error`)
4. `shared_list_imported` (`item_count`, `entry`)

Sender and recipient are usually different anonymous visitors — this is a **process** funnel, not a single-user conversion funnel.

## Report E — Returning families

Use:

- `app_returned` (`days_since_last_open` buckets: `1`, `2-7`, `8-30`, `31+`)
- `saved_list_reopened`
- Umami’s native retention / returning visitors views

Do **not** describe anonymous browser visits as verified individual families.

## Other reliability events

- `product_image_result` — `source` (`store` | `name` | `reference` | `private_label`) × `outcome` (`found` | `not_found` | `error`)
- `storage_operation_failed` — `operation` (`load` | `save` | `photo`) × `reason` (`unavailable` | `read_failed` | `write_failed` | `quota`)
- `adventure_resumed` — explicit Home continue (`phase`: `draft` | `shopping`)

## Delivery notes

- `trackEvent` returns whether Umami **accepted** the invoke (not network delivery).
- Lifetime milestones are marked only when acceptance is true for a real invoke.
- A short in-memory buffer (cap 20, ~15s) waits for late tracker init; nothing is stored across sessions.
- `adventure_started` / `adventure_completed`: at most **once per adventure id** on device. Reducer transitions emit them; ShopScreen / CompleteScreen catch up if hydrate/resume or a late tracker skipped the first send. Persisted ack lists prevent double-counting across reloads.
- `first_*` milestones remain **once per browser profile** (not per adventure).
- `scanner_opened` fires on every camera open (discover and item scan).
