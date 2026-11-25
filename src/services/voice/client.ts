import type { VoiceEvent } from "../../domain/voiceScripts";
import { applyVoiceCacheConfig, ensureVoiceCacheConfig, writeVoiceBlob } from "./cache";

export type VoiceFetchResult =
  | { status: "ok"; blob: Blob; cache: "server-hit" | "server-miss" }
  | { status: "offline" }
  | { status: "limit"; code: string }
  | { status: "error"; code: string };

const LIMIT_CODES = new Set(["rate-limited", "daily-limit", "budget", "in-flight"]);

export type VoiceClientDeps = {
  fetch: typeof fetch;
  online: () => boolean;
  origin: string;
};

/** Device daily soft cap; server still enforces real limits. */
const DEVICE_KEY = "karrie-voice-day";
const DEVICE_PER_DAY = 80;

function dayStamp(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function deviceAllowed(storage: Storage | null, now: number): boolean {
  if (!storage) return true;
  try {
    const raw = storage.getItem(DEVICE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { day?: string; count?: number }) : null;
    if (parsed?.day === dayStamp(now) && (parsed.count ?? 0) >= DEVICE_PER_DAY) return false;
    return true;
  } catch {
    return true;
  }
}

function deviceBump(storage: Storage | null, now: number) {
  if (!storage) return;
  try {
    const day = dayStamp(now);
    const raw = storage.getItem(DEVICE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { day?: string; count?: number }) : null;
    const count = parsed?.day === day ? (parsed.count ?? 0) + 1 : 1;
    storage.setItem(DEVICE_KEY, JSON.stringify({ day, count }));
  } catch {
    // ignore
  }
}

function syncConfigFromHeaders(headers: Headers) {
  const model = headers.get("X-Voice-Model");
  const voice = headers.get("X-Voice-Voice");
  const instructionVersion = headers.get("X-Voice-Instruction");
  const deliveryVersion = headers.get("X-Voice-Delivery");
  const templateVersion = headers.get("X-Voice-Template");
  const cacheNamespace = headers.get("X-Voice-Namespace");
  if (model || voice || instructionVersion || deliveryVersion || templateVersion || cacheNamespace) {
    applyVoiceCacheConfig({
      ...(model ? { model } : {}),
      ...(voice ? { voice } : {}),
      ...(instructionVersion ? { instructionVersion } : {}),
      ...(deliveryVersion ? { deliveryVersion } : {}),
      ...(templateVersion ? { templateVersion } : {}),
      ...(cacheNamespace ? { cacheNamespace } : {}),
    });
  }
}

export function createVoiceClient(deps: VoiceClientDeps) {
  const pending = new Map<string, Promise<VoiceFetchResult>>();

  async function fetchClip(event: VoiceEvent, text: string): Promise<VoiceFetchResult> {
    if (!deps.online()) return { status: "offline" };
    await ensureVoiceCacheConfig(deps.origin);
    const storage = typeof localStorage === "undefined" ? null : localStorage;
    const now = Date.now();
    if (!deviceAllowed(storage, now)) return { status: "limit", code: "device-limit" };

    const key = `${event}|${text}`;
    const existing = pending.get(key);
    if (existing) return existing;

    const work = (async (): Promise<VoiceFetchResult> => {
      try {
        const response = await deps.fetch(`${deps.origin}/api/voice/speak`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, text }),
        });
        if (response.status === 429) {
          const body = await response.json().catch(() => null);
          const code = typeof body?.code === "string" ? body.code : "rate-limited";
          return { status: "limit", code: LIMIT_CODES.has(code) ? code : "rate-limited" };
        }
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          return { status: "error", code: typeof body?.code === "string" ? body.code : `http-${response.status}` };
        }
        syncConfigFromHeaders(response.headers);
        const blob = await response.blob();
        deviceBump(storage, now);
        await writeVoiceBlob(text, blob, event);
        const cache = response.headers.get("X-Voice-Cache") === "hit" ? "server-hit" : "server-miss";
        return { status: "ok", blob, cache };
      } catch {
        return deps.online() ? { status: "error", code: "network" } : { status: "offline" };
      } finally {
        pending.delete(key);
      }
    })();

    pending.set(key, work);
    return work;
  }

  return { fetchClip };
}

export const voiceClient = createVoiceClient({
  fetch: (...args) => fetch(...args),
  online: () => (typeof navigator === "undefined" ? true : navigator.onLine),
  origin: import.meta.env.VITE_API_ORIGIN ?? "",
});
