# Reliability & analytics delivery notes

## Reliability

- [`src/storage/db.ts`](../src/storage/db.ts): `loadPersisted()` returns `{ ok, data }` or `{ ok: false, reason }`; empty install only when reads succeed.
- [`src/state/AdventureContext.tsx`](../src/state/AdventureContext.tsx): saves gated by `mayPersist`; failed load shows Dutch retry UI and never writes empty state.
- [`src/state/sharedPackHydrate.ts`](../src/state/sharedPackHydrate.ts): backoff + online retry instead of permanent session skip.

## Analytics events (new / changed)

| Event | Properties | Notes |
|-------|------------|--------|
| `barcode_lookup_result` | `source`, `outcome` | Server `lookupSource` + device mapping |
| `adventure_first_item_found` | `item_count` | Once per adventure |
| `adventure_resumed` | `phase` | Home continue CTA only |
| `bonus_offered` / `bonus_skipped` | `kind` | Presented / explicit skip |
| `shared_list_open_result` | `outcome` | After share fetch resolves |
| `product_image_result` | `source`, `outcome` | Lookup stores + references |
| `storage_operation_failed` | `operation`, `reason` | Coalesced |

`shopping_list_saved` / `saved_list_reopened` are repeatable (action-instance once keys).  
`trackEvent` returns acceptance only; short init buffer; once-duplicates are not acceptance.

## Privacy

- Umami guards unchanged (domains, DNT, exclude search/hash, `/l` `/s` sanitization).
- [`public/privacy.html`](../public/privacy.html): WhatsApp preview + `/s` path wording updated.
- Reporting guide: [`docs/product-analytics.md`](product-analytics.md).

## Tests & builds

**Passed (relevant suites):** storage/db, persistGate, sharedPackHydrate, analytics, analyticsEvents, barcode client+server, shareList sanitization. Frontend + server production builds succeed.

**Pre-existing failures (unrelated to this work):** `customProduct` / `addSearch` cashewnoten catalog alias, one `homeAdventure` web-page verdict, flaky `offers.reducer` play-kind seed — not introduced here.

**Unverified:** live Umami Cloud network payloads in production (no production Umami env in this session).

## Deferred (Phase 7)

- Alle lijstjes view
- Remove swipe-to-skip
- Colour-hunt map tweaks (e.g. water → blauw)
