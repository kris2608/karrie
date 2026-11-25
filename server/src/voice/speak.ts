import { isAllowedSpeechText, type VoiceEvent } from "./allowlist.js";
import { voiceCacheKey, type VoiceCache, type VoiceCacheEntry } from "./cache.js";
import { VOICE_DELIVERY_VERSION, VOICE_INSTRUCTION_VERSION, VOICE_LANGUAGE } from "./personality.js";
import type { SpeechProvider } from "./provider.js";

export type SpeakRequest = {
  event: VoiceEvent;
  text: string;
};

export type SpeakResult =
  | {
      ok: true;
      entry: VoiceCacheEntry;
      cacheHit: boolean;
      key: string;
      usage?: { inputTokens: number; cachedInputTokens: number; outputTokens: number; audioOutputTokens?: number };
    }
  | { ok: false; code: "invalid" | "misconfigured" | "upstream" };

const inflight = new Map<string, Promise<SpeakResult>>();

export type SpeakService = {
  speak(request: SpeakRequest): Promise<SpeakResult>;
  stats(): ReturnType<VoiceCache["stats"]> & { generates: number; failures: number };
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

  async function generate(request: SpeakRequest): Promise<SpeakResult> {
    const text = request.text.replace(/\s+/g, " ").trim();
    if (!isAllowedSpeechText(text)) return { ok: false, code: "invalid" };
    if (!deps.provider) return { ok: false, code: "misconfigured" };

    const key = voiceCacheKey({
      text,
      language: VOICE_LANGUAGE,
      voice: deps.provider.voice,
      instructionVersion: `${VOICE_INSTRUCTION_VERSION}|${VOICE_DELIVERY_VERSION}|${deps.templateVersion}|${request.event}`,
      model: deps.provider.model,
    });

    const cached = await deps.cache.get(key);
    if (cached) return { ok: true, entry: cached, cacheHit: true, key };

    const pending = inflight.get(key);
    if (pending) return pending;

    const work = (async (): Promise<SpeakResult> => {
      try {
        const generated = await deps.provider!.generate(text, { event: request.event });
        const entry: VoiceCacheEntry = {
          audio: generated.audio,
          contentType: generated.contentType,
          model: generated.model,
          voice: generated.voice,
        };
        await deps.cache.set(key, entry);
        generates += 1;
        return { ok: true, entry, cacheHit: false, key, usage: generated.usage };
      } catch {
        failures += 1;
        return { ok: false, code: "upstream" };
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, work);
    return work;
  }

  return {
    speak: generate,
    stats: () => ({ ...deps.cache.stats(), generates, failures }),
    config: () => ({
      model: deps.provider?.model ?? "gpt-realtime-2.1-mini",
      voice: deps.provider?.voice ?? "marin",
      language: VOICE_LANGUAGE,
      instructionVersion: VOICE_INSTRUCTION_VERSION,
      deliveryVersion: VOICE_DELIVERY_VERSION,
      templateVersion: deps.templateVersion,
      cacheNamespace: deps.cacheNamespace,
    }),
  };
}
