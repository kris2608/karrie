import { isAllowedSpeechText, type VoiceEvent } from "./allowlist.js";
import { voiceCacheKey, type VoiceCache, type VoiceCacheEntry } from "./cache.js";
import { libraryLookup } from "./library.js";
import { VOICE_DELIVERY_VERSION, VOICE_INSTRUCTION_VERSION, VOICE_LANGUAGE } from "./personality.js";
import type { SpeechProvider } from "./provider.js";

export type SpeakRequest = {
  event: VoiceEvent;
  text: string;
  priority?: "interactive" | "background";
};

export type SpeakResult =
  | {
      ok: true;
      entry: VoiceCacheEntry;
      cacheHit: boolean;
      libraryHit?: boolean;
      key: string;
      usage?: { inputTokens: number; cachedInputTokens: number; outputTokens: number; audioOutputTokens?: number };
    }
  | { ok: false; code: "invalid" | "misconfigured" | "upstream"; error?: string };

const inflight = new Map<string, Promise<SpeakResult>>();

export type SpeakService = {
  /** Cache or bundled library only. Does not call the speech provider. */
  lookup(request: SpeakRequest): Promise<SpeakResult | null>;
  speak(request: SpeakRequest): Promise<SpeakResult>;
  stats(): ReturnType<VoiceCache["stats"]> & { generates: number; failures: number; libraryHits: number };
  config(): {
    model: string;
    voice: string;
    language: string;
    instructionVersion: string;
    deliveryVersion: string;
    templateVersion: string;
    cacheNamespace: string;
  };
};

export function createSpeakService(deps: {
  provider: SpeechProvider | null;
  cache: VoiceCache;
  templateVersion: string;
  cacheNamespace: string;
}): SpeakService {
  let generates = 0;
  let failures = 0;
  let libraryHits = 0;

  function cacheKeyFor(text: string, event: SpeakRequest["event"]): string | null {
    if (!deps.provider) return null;
    return voiceCacheKey({
      text,
      language: VOICE_LANGUAGE,
      voice: deps.provider.voice,
      instructionVersion: `${VOICE_INSTRUCTION_VERSION}|${VOICE_DELIVERY_VERSION}|${deps.templateVersion}|${event}`,
      model: deps.provider.model,
    });
  }

  /** Shared clip for this text, voice and event. Same words on any device reuse one generation. */
  async function lookup(request: SpeakRequest): Promise<SpeakResult | null> {
    const text = request.text.replace(/\s+/g, " ").trim();
    if (!isAllowedSpeechText(text)) return { ok: false, code: "invalid" };
    const key = cacheKeyFor(text, request.event);
    if (!key) return null;
    const cached = await deps.cache.get(key);
    if (cached) return { ok: true, entry: cached, cacheHit: true, key };
    const fromLibrary = libraryLookup({ cacheKey: key, event: request.event, text });
    if (!fromLibrary) return null;
    libraryHits += 1;
    await deps.cache.set(key, fromLibrary);
    return { ok: true, entry: fromLibrary, cacheHit: true, libraryHit: true, key };
  }

  async function generate(request: SpeakRequest): Promise<SpeakResult> {
    const text = request.text.replace(/\s+/g, " ").trim();
    if (!isAllowedSpeechText(text)) return { ok: false, code: "invalid" };
    if (!deps.provider) return { ok: false, code: "misconfigured" };

    const key = cacheKeyFor(text, request.event)!;
    const ready = await lookup(request);
    if (ready) {
      if (ready.ok) {
        console.info(
          JSON.stringify({
            event: "voice_speak",
            cache: ready.libraryHit ? "library" : "hit",
            priority: request.priority ?? "interactive",
            textLen: text.length,
          }),
        );
      }
      return ready;
    }

    const pending = inflight.get(key);
    if (pending) return pending;

    const work = (async (): Promise<SpeakResult> => {
      const started = Date.now();
      try {
        console.info(
          JSON.stringify({
            event: "voice_speak",
            cache: "miss",
            priority: request.priority ?? "interactive",
            textLen: text.length,
          }),
        );
        const generated = await deps.provider!.generate(text, { event: request.event });
        const entry: VoiceCacheEntry = {
          audio: generated.audio,
          contentType: generated.contentType,
          model: generated.model,
          voice: generated.voice,
        };
        await deps.cache.set(key, entry);
        generates += 1;
        console.info(
          JSON.stringify({
            event: "voice_generate",
            ms: Date.now() - started,
            priority: request.priority ?? "interactive",
            textLen: text.length,
          }),
        );
        return { ok: true, entry, cacheHit: false, key, usage: generated.usage };
      } catch (error) {
        failures += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          JSON.stringify({
            event: "voice_generate_fail",
            ms: Date.now() - started,
            error: message.slice(0, 160),
          }),
        );
        return { ok: false, code: "upstream", error: message.slice(0, 240) };
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, work);
    return work;
  }

  return {
    lookup,
    speak: generate,
    stats: () => ({ ...deps.cache.stats(), generates, failures, libraryHits }),
    config: () => ({
      model: deps.provider?.model ?? "edge-tts",
      voice: deps.provider?.voice ?? "nl-NL-MaartenNeural",
      language: VOICE_LANGUAGE,
      instructionVersion: VOICE_INSTRUCTION_VERSION,
      deliveryVersion: VOICE_DELIVERY_VERSION,
      templateVersion: deps.templateVersion,
      cacheNamespace: deps.cacheNamespace,
    }),
  };
}
