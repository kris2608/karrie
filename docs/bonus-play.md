# Bonusmissies mini-games (Phases 2–3)

Offline shopping mini-games under the existing **Bonusmissies** (`settings.smartDiscovery`) switch. No OpenAI, no new APIs or tables. Controlled with healthier missions by one deterministic picker.

## Play kinds

| Kind | Dutch cue | Behaviour |
|------|-----------|-----------|
| `guess` | Raad het product! | Overlay names the list item and shows two unlabeled drawings. Distractor prefers a different silhouette/colour (widens beyond the shelf if needed). Child taps the matching picture. Correct → celebrate, keep searching (not found). Wrong → gentle retry. Skip → `skipped`. |
| `color` | Zoek iets [kleur]! | Curated `COLOR_HUNT` from unambiguous `ART` colours only. Gevonden! still finds the product. |
| `drag` | Sleep naar Karrie! | Free-drag art onto Karrie (`useFoundSequence.collect`). Swipe-to-skip disabled so left flicks are not “later”; Later button stays. Enter/Space collects when focused. Reduced motion → instant collect (no flight). |

`PlayOffer` lives on `AdventureItem.play` and does **not** overload healthier `MissionState`.

## Unified selection (`assignBonuses`)

Seed = `adventure.id`:

1. Healthier offers first (`pickMissions`, max 3).
2. Among remaining non-found items without a healthier offer, assign play ≈ **1 per 3 products** (flexible on short lists).
3. Never two bonuses on the same product; never interrupt an active healthier mission in the shop UI.
4. Rotate play kinds; skip a kind when no distractor / colour / drag eligibility.
5. Persist `play` on adventure JSON (survives reload mid-shop). Fresh pick on each `start-shopping`.
6. `smartDiscovery === false` → no healthier, no play.

## Rewards & analytics

- Rewards unchanged: one find star; healthier still +2 via existing path. Mini-games add **no** new currency.
- Anonymous: `bonus_play_completed` with `{ kind: guess|color|drag }` only.

## Out of scope

New settings toggle; game homepage; accounts; MissionCard redesign; AI for mini-games.
