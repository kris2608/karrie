# Healthier-alternative bonus missions

## Phase 1 report (2026-11-09)

### Coverage numbers (Postgres diagnose)

Measured against the live catalog DB (counts only; IndexedDB page facts are device-local and excluded):

| Metric | Count |
|--------|------:|
| Generic products | 99 |
| Branded products | 28 |
| GTINs | 26 |
| OFF fact rows | 23 |
| With ingredients | 16 |
| With per100 | 22 |
| With Nutri-Score | 17 |
| Assessable variants (ingredients or usable macros) | **22** |

### Root causes (why missions were rare)

1. Assessments only came from AI **photo** recognition.
2. Barcode/OFF nutrition was stored on the item but **ingredients were dropped**.
3. IndexedDB product-page facts were display-only.
4. Auto-offer required `evidence === "label"`, which front-of-pack photos often lack.
5. Bare catalog generics (e.g. “Pindakaas”, “Melk”) correctly never get a mission.

### What shipped

- Evidence assembly (`src/domain/productEvidence.ts`) — OFF → page → photo; never mix variants; never invent facts.
- Assess API — `POST /api/products/healthier-alternative` with rules-first reject, OpenAI structured text, 30-day evidence-hash cache (`007_healthier_assessments.sql`).
- Local guards — `resolveAssessment` / `labelCheck` / nutrition supports; Nutri-Score never decisive.
- Review preflight — assesses up to 5 eligible draft items; **priority order** first: `pindakaas`, `yoghurt`, `brood`, `muesli`, `havermout`, `noten` (others may still run afterward within the cap).
- Catalog hole closed — `noten` added to client catalog, server bootstrap, `FOOD_TYPES`, and `ART` so salted→unsalted nut missions can resolve `targetType`. `ontbijtgranen` stays a `SAME_PURPOSE` source → `muesli` / `havermout` only.
- UI / rewards — MissionCard, DiscoverySwitch, stars, skip/undo unchanged.

### Verified peanut-butter path

Fixture (no live OpenAI spend in CI):

1. Fixed OFF-like evidence for Calvé-style peanut butter (sugar + salt in ingredients).
2. Mocked OpenAI structured alternative → cache write in `healthier_assessments`.
3. Client `resolveAssessment` → `possible` + Dutch parent line mentioning the label.
4. `pickMissions` offers the item when `smartDiscovery` is on.
5. Bare `melk` / empty evidence → no mission (rules-first; model never called).

### Limitations

- Only **22** assessable PG variants today; OFF NL ingredients coverage is incomplete.
- Page facts can be wrong and stay on one device.
- Generics without formulation evidence stay out by design.
- Suggesting a *specific* brand still requires confirmed evidence for that product; otherwise only generic guidance + catalog drawing.
- No invented facts: missing ingredients/nutrition → no mission.

## Architecture

1. **Evidence** (`src/domain/productEvidence.ts`) — assemble OFF → page → photo facts; never mix variants.
2. **Assess** — `POST /api/products/healthier-alternative` with rules-first reject, OpenAI text structured output, 30-day evidence-hash cache (`007_healthier_assessments.sql`).
3. **Validate** — existing `resolveAssessment` / `labelCheck` plus nutrition guards; Nutri-Score never decisive.
4. **Preflight** — Review screen assesses eligible draft items while the parent prepares the list; priority focus types first; `pickMissions` at start-shopping unchanged for healthier offers.
5. **UI / rewards** — MissionCard, DiscoverySwitch, stars, skip/undo unchanged.
