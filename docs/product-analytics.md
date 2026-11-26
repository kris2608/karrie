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

1. `first_home_viewed` (once per profile, first-time home only)
2. `new_adventure_clicked` (`entry`: `first` | `return`, plus allowlisted UTMs when present)
3. `shopping_list_created` / `first_list_created`
4. `shopping_list_reviewed` (once per adventure; no list contents)
5. `shopping_list_saved` / `first_list_saved` (explicit save only)
6. `adventure_started`
7. `adventure_first_item_found` (property `item_count`)
8. `adventure_completed` (properties `item_count`, `completed_missions`)

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
- `voice_opt_in` — parent answered the voice prompt (`enabled`: `0` | `1`); never includes product text
- `voice_muted` — speaker turned off in shop or settings
- `voice_playback_failed` — `reason` (`play` | `element` | `network` | `fetch`); `fetch` may include `code` (e.g. `upstream`, `offline`)

## Report F — Campaign landing → adventure

Pageviews still strip query strings (`data-exclude-search`). Campaign attribution uses **allowlisted custom events** only:

1. `landing_view` — marketing page open (`page`, optional `utm_source` / `utm_medium` / `utm_campaign`)
2. `landing_cta_clicked` — CTA on a marketing page (`page`, `placement`, optional UTMs)
3. `new_adventure_clicked` — may include the same UTM fields when captured earlier in the tab session
4. `adventure_started` — may include the same UTM fields

Only `utm_source`, `utm_medium` and `utm_campaign` are stored (sessionStorage, max ~7 days) and never arbitrary query params, list tokens or shopping contents.

Example links (canonical host):

- `https://www.karrie.eu/ontdek?utm_source=chatgpt&utm_medium=paid&utm_campaign=launch_nl`
- `https://www.karrie.eu/ontdek?utm_source=instagram&utm_medium=paid&utm_campaign=launch_nl`
- `https://www.karrie.eu/ontdek?utm_source=creator&utm_medium=referral&utm_campaign=launch_nl`
- `https://www.karrie.eu/ig` and `https://www.karrie.eu/ig/` redirect to `/?utm_source=instagram&utm_medium=social&utm_campaign=bio` and send `landing_view` with `page=ig`

## Delivery notes

- `trackEvent` returns whether Umami **accepted** the invoke (not network delivery).
- Lifetime milestones are marked only when acceptance is true for a real invoke.
- A short in-memory buffer (cap 20, ~15s) waits for late tracker init; nothing is stored across sessions.
- `adventure_started` / `adventure_completed`: at most **once per adventure id** on device. Reducer transitions emit them; ShopScreen / CompleteScreen catch up if hydrate/resume or a late tracker skipped the first send. Persisted ack lists prevent double-counting across reloads.
- `first_*` milestones remain **once per browser profile** (not per adventure).
- `scanner_opened` fires on every camera open (discover and item scan).
