import { cacheKeyParts, VOICE_INSTRUCTION_VERSION, VOICE_LANGUAGE, VOICE_DELIVERY_VERSION, VOICE_TEMPLATE_VERSION } from "../../domain/voiceScripts";

/** Fallback until GET /api/voice/config resolves — must match server personality defaults. */
const FALLBACK = {
  model: "gpt-realtime-2.1-mini",
  voice: "marin",
  language: VOICE_LANGUAGE,
  instructionVersion: VOICE_INSTRUCTION_VERSION,
  deliveryVersion: VOICE_DELIVERY_VERSION,
  templateVersion: VOICE_TEMPLATE_VERSION,
  cacheNamespace: "karrie-voice-v5",
};

export type VoiceCacheConfig = typeof FALLBACK;

let config: VoiceCacheConfig = { ...FALLBACK };
let configLoaded = false;
let configPromise: Promise<VoiceCacheConfig> | null = null;

const memory = new Map<string, Blob>();

export function getVoiceCacheConfig(): VoiceCacheConfig {
  return config;
}

export function applyVoiceCacheConfig(next: Partial<VoiceCacheConfig>): VoiceCacheConfig {
  config = {
    model: next.model || config.model,
    voice: next.voice || config.voice,
    language: next.language || config.language,
    instructionVersion: next.instructionVersion || config.instructionVersion,
    deliveryVersion: next.deliveryVersion || config.deliveryVersion,
    templateVersion: next.templateVersion || config.templateVersion,
    cacheNamespace: next.cacheNamespace || config.cacheNamespace,
  };
  configLoaded = true;
  return config;
}

/** Fetch server voice identity once per session so Cache API keys stay in sync. */
export async function ensureVoiceCacheConfig(origin = import.meta.env.VITE_API_ORIGIN ?? ""): Promise<VoiceCacheConfig> {
  if (configLoaded) return config;
  if (configPromise) return configPromise;
  configPromise = (async () => {
    try {
      const response = await fetch(`${origin}/api/voice/config`);
      if (!response.ok) return config;
      const body = (await response.json()) as Partial<VoiceCacheConfig> & { status?: string };
      if (body.status && body.status !== "ok") return config;
      return applyVoiceCacheConfig(body);
    } catch {
      return config;
    } finally {
      configPromise = null;
    }
  })();
  return configPromise;
}

export function localCacheKey(text: string, event?: string): string {
  return cacheKeyParts({
    text,
    voice: config.voice,
    model: config.model,
    instructionVersion: config.instructionVersion,
    deliveryVersion: config.deliveryVersion,
    templateVersion: config.templateVersion,
    language: config.language,
    event,
  });
}

function cacheUrl(key: string): string {
  return `https://voice.karrie.local/${encodeURIComponent(key)}`;
}

function cacheName(): string {
  return config.cacheNamespace;
}

/** Sync memory peek — used so product speech never waits on Cache API I/O. */
export function peekVoiceBlob(text: string, event?: string): Blob | null {
  return memory.get(localCacheKey(text, event)) ?? null;
}

export async function readVoiceBlob(text: string, event?: string): Promise<Blob | null> {
  await ensureVoiceCacheConfig();
  const key = localCacheKey(text, event);
  const hit = memory.get(key);
  if (hit) return hit;
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(cacheName());
    const response = await cache.match(cacheUrl(key));
    if (!response) return null;
    const blob = await response.blob();
    memory.set(key, blob);
    return blob;
  } catch {
    return null;
  }
}

export async function writeVoiceBlob(text: string, blob: Blob, event?: string): Promise<void> {
  await ensureVoiceCacheConfig();
  const key = localCacheKey(text, event);
  memory.set(key, blob);
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(cacheName());
    await cache.put(
      cacheUrl(key),
      new Response(blob, {
        headers: {
          "Content-Type": blob.type || "audio/wav",
          "Cache-Control": "max-age=31536000",
        },
      }),
    );
  } catch {
    // Quota or private mode — memory still helps this session.
  }
}
