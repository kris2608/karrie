# Voice Reliability Stabilization — Handoff

## Root causes confirmed

1. Playback ownership races (`token` shared; `finishClip` no-op; `stopCurrent` cleared `onended` without settling).
2. Spoken-before-success in shop voice (could not cleanly re-request after mute/fail).
3. Competing speech + prefetch storm (up to 12 background fetches).
4. Weak Realtime validation (speculative `response.create`, missing-transcript accept, loose match).
5. Cold latency (new WS per miss; no permanent catalog library; per-clip `Audio`).

## What changed

| Area | Files |
|------|--------|
| PlayId FSM | `src/services/voice/controller.ts` |
| Prefetch scheduler | `src/services/voice/scheduler.ts`, `client.ts` |
| Instruction lifecycle | `src/features/shop/useShopVoice.ts` |
| Persistent speech element | `src/feedback/sound.ts` |
| Realtime validate | `server/src/voice/provider.ts`, `transcript.ts` |
| Personality v5 + 4 templates | `personality.ts`, `voiceScripts.ts`, `allowlist.ts` |
| Voice library | `server/src/voice/library.ts`, `scripts/voice-library.mjs`, `speak.ts` |
| Dev harness | `src/features/dev/VoiceLabScreen.tsx` → `/dev/voice-lab` |

## Automatic speech (P0)

Only: (1) current product instruction, (2) mission replacing product while active, (3) complete-screen celebration. Guess: no auto speech. Praise/encouragement/play prompts disabled on happy path. Manual replay stays.

## Production checklist

- `OPENAI_VOICE_MODEL=gpt-realtime-2.1-mini`
- `OPENAI_VOICE=marin` (keep until audition decides otherwise)
- `VOICE_MAX_CONCURRENT` unchanged (default 2) — do not raise to mask scheduling
- Postgres `voice_cache` when `CANDIDATES_DATABASE_URL` set
- Cache namespace `karrie-voice-v5` (client + server)
- Optional: run `cd server && npm run voice:library` once to populate library (not every deploy)

## Latency notes (measure locally — do not claim fixed from unit tests alone)

| Path | How to measure | Target |
|------|----------------|--------|
| Bundled/library or Cache API hit | Voice lab → Play product after warm | &lt;250ms start |
| Server Postgres hit | Speak with cache warm, cold client | typically &lt;500ms network |
| Cold Realtime | First miss after deploy | often multi-second WS |

Record numbers in a real-device pass (iPhone Safari/PWA, Android Chrome/PWA, lock/resume, rapid advance, slow net, offline).

## Device matrix (manual)

- [ ] iPhone Safari + PWA: unlock → first product, mute/unmute, rapid next item
- [ ] Android Chrome + PWA: same
- [ ] Background/lock resume then replay
- [ ] Offline after cache warm (library/cache hit)
- [ ] Mission active replaces product; guess has no auto speech

## Remaining limitations

- Catalog library starts empty until `voice:library` is run with API key.
- Positive/incorrect/play auto-speech still disabled pending reliability proof.
- Marin kept as baseline; switch voice only after listening to `voice:audition` samples.
- Unit tests cover ownership/cancel/validation; they do not prove end-to-end latency or iOS autoplay.

## Dev harness

`npm run dev` → open `/dev/voice-lab` (DEV only). Play / cancel / inspect config + timings.
