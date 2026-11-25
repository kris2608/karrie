# Voice Reliability + Library Integration — Handoff

## Coverage (mandatory)

| Metric | Result |
|--------|--------|
| Generic catalog products | **101 / 101** |
| Manifest text == `productPhrase` / catalogue instruction | **101 / 101** |
| Valid RIFF/WAVE per product file | **101 / 101** (Vitest) |
| Selective regen this pass | **16 generated**, **95 reused** (111 total incl. mission/complete/positive) |
| Library size (`public/voice-library`) | ~8.5 MB WAV |

Unit suites: client voice/catalog **23 passed**; server voice **17 passed** after library mock in speak tests.

## What shipped

- Canonical [`src/data/voice-catalog.json`](../src/data/voice-catalog.json) + [`voiceCatalog.ts`](../src/domain/voiceCatalog.ts)
- `productPhrase` returns fixed catalogue lines for generics (qty/adventure ignored)
- Library script reads catalogue; `OPENAI_VOICE` (not `OPENAI_VOICE_VOICE`); reuse-by-text+versions
- Client: manifest-only library fetch, WAV validation, async config, scheduler promote/pending hygiene
- Cancel speech on found; separate silent unlock element
- Workbox: precache `voice-library/manifest.json`; runtime `CacheFirst` for WAV/json
- Server `libraryLookup` requires `cacheKey` only

## Audio order (generics)

1. Valid memory  
2. Valid Cache API (after validated)  
3. Manifest static library  
4. Server cache / Realtime  

Config refresh is backgrounded before library hits.

## Env checklist

- `OPENAI_VOICE_MODEL=gpt-realtime-2.1-mini`
- `OPENAI_VOICE=marin`
- Postgres `voice_cache` when DB URL set
- Namespace `karrie-voice-v5`

## Latency / device notes (measure on device — not claimed fixed from unit tests)

| Path | How | Target |
|------|-----|--------|
| Library/Cache hit | `/dev/voice-lab` or first product after warm | &lt;250 ms start |
| Server hit | cold client, warm Postgres | often &lt;500 ms net |
| Cold Realtime | first miss | multi-second |

Manual: iPhone Safari/PWA unlock → product → mute/unmute → rapid advance; Android Chrome/PWA; offline after library warm; mission replaces product; guess no auto spoil.

## Remaining limitations

- Full WAV library is runtime-cached, not install-precached (~8.5 MB).
- Praise/play auto-speech still off.
- Marin/v5 unchanged without owner approval.
