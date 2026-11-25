import { cacheKeyParts, VOICE_INSTRUCTION_VERSION, VOICE_LANGUAGE } from "../../domain/voiceScripts";

const CACHE_NAME = "karrie-voice-v2";
/** Client-side model/voice labels must match server defaults for cache hits across sessions. */
export const CLIENT_VOICE_MODEL = "gpt-4o-mini-tts";
export const CLIENT_VOICE_NAME = "nova";

const memory = new Map<string, Blob>();

export function localCacheKey(text: string): string {
  return cacheKeyParts({
    text,
    voice: CLIENT_VOICE_NAME,
    model: CLIENT_VOICE_MODEL,
    instructionVersion: VOICE_INSTRUCTION_VERSION,
    language: VOICE_LANGUAGE,
  });
}

function cacheUrl(key: string): string {
  return `https://voice.karrie.local/${encodeURIComponent(key)}`;
}

/** Sync memory peek — used so product speech never waits on Cache API I/O. */
export function peekVoiceBlob(text: string): Blob | null {
  return memory.get(localCacheKey(text)) ?? null;
}

export async function readVoiceBlob(text: string): Promise<Blob | null> {
  const key = localCacheKey(text);
  const hit = memory.get(key);
  if (hit) return hit;
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(cacheUrl(key));
    if (!response) return null;
    const blob = await response.blob();
    memory.set(key, blob);
    return blob;
  } catch {
    return null;
  }
}

export async function writeVoiceBlob(text: string, blob: Blob): Promise<void> {
  const key = localCacheKey(text);
  memory.set(key, blob);
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      cacheUrl(key),
      new Response(blob, {
        headers: {
          "Content-Type": blob.type || "audio/mpeg",
          "Cache-Control": "max-age=31536000",
        },
      }),
    );
  } catch {
    // Quota or private mode — memory still helps this session.
  }
}
