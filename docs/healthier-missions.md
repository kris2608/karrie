# Healthier-alternative bonus missions

## Why missions were rare

Assessments only came from AI **photo** recognition. Barcode/OFF nutrition was stored on the item but ingredients were dropped. IndexedDB product-page facts were display-only. Auto-offer required `evidence === "label"`, which front-of-pack photos often lack. Bare catalog generics (e.g. “Pindakaas”) correctly never got a mission.

## Postgres coverage (diagnose-product-facts.mjs)

Measured 2026-11-09 against the live catalog DB (counts only):

| Metric | Count |
|--------|------:|
| Generic products | 99 |
| Branded products | 28 |
| GTINs | 26 |
| OFF fact rows | 23 |
| With ingredients | 16 |
| With per100 | 22 |
| With Nutri-Score | 17 |
| Assessable variants (ingredients or usable macros) | 22 |

IndexedDB page facts are device-local and are **not** included above.

## Architecture

1. **Evidence** (`src/domain/productEvidence.ts`) — assemble OFF → page → photo facts; never mix variants.
2. **Assess** — `POST /api/products/healthier-alternative` with rules-first reject, OpenAI text structured output, 30-day evidence-hash cache (`007_healthier_assessments.sql`).
3. **Validate** — existing `resolveAssessment` / `labelCheck` plus nutrition guards; Nutri-Score never decisive.
4. **Preflight** — Review screen assesses eligible draft items while the parent prepares the list; `pickMissions` at start-shopping unchanged.
5. **UI / rewards** — MissionCard, DiscoverySwitch, stars, skip/undo unchanged.

## Remaining limitations

- OFF NL ingredients coverage is incomplete.
- Page facts can be wrong and stay on one device.
- Generics without formulation evidence stay out by design.
- Suggesting a *specific* brand still requires confirmed evidence for that product; otherwise only generic guidance + catalog drawing.
