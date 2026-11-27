import { apiFetch } from "../apiSession";
import type { VoiceEvent } from "../../domain/voiceScripts";
import { applyVoiceCacheConfig, ensureVoiceCacheConfig, writeVoiceBlob } from "./cache";

export type VoiceFetchResult =
  | { status: "ok"; blob: Blob; cache: "server-hit" | "server-miss" }
  | { status: "offline" }
  | { status: "limit"; code: string }
  | { status: "error"; code: string }
  | { status: "cancelled" };

const LIMIT_CODES = new Set(["rate-limited", "daily-limit", "budget", "in-flight", "device-limit"]);

export type VoiceClientDeps = {
  fetch: typeof fetch;
  online: () => boolean;
  origin: string;
  storage?: Storage | null;
  now?: () => number;
  /** Test hook. Production waits between upstream retries. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

export type FetchClipOptions = {
  priority?: "interactive" | "background";
  signal?: AbortSignal;
};

/**
 * Cap on new generations for this device, per UTC day.
 * A shop of about 40 new product names, tried a few times, stays under it.
 * Repeats of a clip the server already has do not count.
 */
const DEVICE_KEY = "karrie-voice-day";
export const VOICE_DEVICE_PER_DAY = 300;
const UPSTREAM_TRIES = 3;
const UPSTREAM_BACKOFF_MS = [400, 1_200];

function dayStamp(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function deviceAllowed(storage: Storage | null, now: number): boolean {
  if (!storage) return true;
  try {
    const raw = storage.getItem(DEVICE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { day?: string; count?: number }) : null;
    if (parsed?.day === dayStamp(now) && (parsed.count ?? 0) >= VOICE_DEVICE_PER_DAY) return false;
    return true;
  } catch {
    return true;
  }
}

function deviceCount(storage: Storage | null, now: number): number {
  if (!storage) return 0;
  try {
    const raw = storage.getItem(DEVICE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { day?: string; count?: number }) : null;
    return parsed?.day === dayStamp(now) ? (parsed.count ?? 0) : 0;
  } catch {
    return 0;
  }
}

function deviceBump(storage: Storage | null, now: number) {
  if (!storage) return;
  try {
    const day = dayStamp(now);
    const count = deviceCount(storage, now) + 1;
    storage.setItem(DEVICE_KEY, JSON.stringify({ day, count }));
  } catch {
    // ignore
  }
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
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
  const sleep = deps.sleep ?? defaultSleep;

  function storage(): Storage | null {
    if (deps.storage !== undefined) return deps.storage;
    return typeof localStorage === "undefined" ? null : localStorage;
  }

  async function attempt(event: VoiceEvent, text: string, options: FetchClipOptions | undefined, capped: boolean): Promise<VoiceFetchResult> {
    try {
      const response = await deps.fetch(`${deps.origin}/api/voice/speak`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Over the generation cap we still accept a shared cache hit, and we do not ask Edge to speak a new line.
          ...(capped ? { "X-Voice-Generate": "0" } : {}),
        },
        body: JSON.stringify({
          event,
          text,
          priority: options?.priority ?? "interactive",
        }),
        signal: options?.signal,
      });
      if (options?.signal?.aborted) return { status: "cancelled" };
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
      const cacheHit = response.headers.get("X-Voice-Cache") === "hit";
      if (!cacheHit) deviceBump(storage(), deps.now?.() ?? Date.now());
      await writeVoiceBlob(text, blob, event);
      return { status: "ok", blob, cache: cacheHit ? "server-hit" : "server-miss" };
    } catch (error) {
      if (options?.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        return { status: "cancelled" };
      }
      return deps.online() ? { status: "error", code: "network" } : { status: "offline" };
    }
  }

  async function fetchClip(
    event: VoiceEvent,
    text: string,
    options?: FetchClipOptions,
  ): Promise<VoiceFetchResult> {
    if (options?.signal?.aborted) return { status: "cancelled" };
    if (!deps.online()) return { status: "offline" };
    await ensureVoiceCacheConfig(deps.origin);
    if (options?.signal?.aborted) return { status: "cancelled" };
    const now = deps.now?.() ?? Date.now();
    const capped = !deviceAllowed(storage(), now);

    const key = `${event}|${text}`;
    const existing = pending.get(key);
    if (existing && !options?.signal) return existing;

    const work = (async (): Promise<VoiceFetchResult> => {
      try {
        let result = await attempt(event, text, options, capped);
        for (let retry = 0; retry < UPSTREAM_TRIES - 1 && result.status === "error" && (result.code === "upstream" || result.code === "network"); retry += 1) {
          if (options?.signal?.aborted) return { status: "cancelled" };
          await sleep(UPSTREAM_BACKOFF_MS[retry] ?? 1_200, options?.signal);
          if (options?.signal?.aborted) return { status: "cancelled" };
          result = await attempt(event, text, options, capped);
        }
        return result;
      } finally {
        pending.delete(key);
      }
    })();

    if (!options?.signal) pending.set(key, work);
    return work;
  }

  return { fetchClip };
}

export const voiceClient = createVoiceClient({
  fetch: (input, init) => apiFetch(input, init),
  online: () => (typeof navigator === "undefined" ? true : navigator.onLine),
  origin: import.meta.env.VITE_API_ORIGIN ?? "",
});
