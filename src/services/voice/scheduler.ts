import type { VoicePhrase } from "../../domain/voiceScripts";
import { ensureVoiceCacheConfig, peekVoiceBlob, readVoiceBlob, writeVoiceBlob } from "./cache";
import { voiceClient, type VoiceFetchResult } from "./client";

export type FetchPriority = "interactive" | "background";

export type ScheduledFetchResult =
  | { ok: true; blob: Blob; source: "memory" | "cache" | "server" | "library"; ms: number }
  | { ok: false; code: string; ms: number };

type Job = {
  key: string;
  phrase: VoicePhrase;
  priority: FetchPriority;
  deadlineAt: number;
  resolve: (result: ScheduledFetchResult) => void;
  abort: AbortController;
};

const MAX_BACKGROUND = 1;
const MAX_QUEUE = 3;
const BACKGROUND_DEADLINE_MS = 12_000;

/**
 * Single client-side audio fetch scheduler: interactive preempts background,
 * at most one background generate, deduped by phrase key.
 */
export function createVoiceScheduler() {
  const pending = new Map<string, Promise<ScheduledFetchResult>>();
  const queue: Job[] = [];
  let backgroundActive = 0;
  let interactiveActive = 0;

  function phraseKey(phrase: VoicePhrase): string {
    return `${phrase.event}|${phrase.text}`;
  }

  async function runFetch(phrase: VoicePhrase, signal: AbortSignal, priority: FetchPriority): Promise<ScheduledFetchResult> {
    const started = Date.now();
    if (signal.aborted) return { ok: false, code: "cancelled", ms: 0 };

    const warm = peekVoiceBlob(phrase.text, phrase.event);
    if (warm) return { ok: true, blob: warm, source: "memory", ms: Date.now() - started };

    await ensureVoiceCacheConfig();
    if (signal.aborted) return { ok: false, code: "cancelled", ms: Date.now() - started };

    const cached = await readVoiceBlob(phrase.text, phrase.event);
    if (signal.aborted) return { ok: false, code: "cancelled", ms: Date.now() - started };
    if (cached) return { ok: true, blob: cached, source: "cache", ms: Date.now() - started };

    // Bundled catalog library (optional public assets).
    try {
      const lib = await fetchLibraryClip(phrase);
      if (lib) {
        await writeVoiceBlob(phrase.text, lib, phrase.event);
        return { ok: true, blob: lib, source: "library", ms: Date.now() - started };
      }
    } catch {
      // ignore library miss
    }
    if (signal.aborted) return { ok: false, code: "cancelled", ms: Date.now() - started };

    const result: VoiceFetchResult = await voiceClient.fetchClip(phrase.event, phrase.text, {
      priority,
      signal,
    });
    if (signal.aborted) return { ok: false, code: "cancelled", ms: Date.now() - started };
    if (result.status === "ok") {
      return { ok: true, blob: result.blob, source: "server", ms: Date.now() - started };
    }
    const code =
      result.status === "limit" || result.status === "error" ? result.code : result.status === "offline" ? "offline" : result.status;
    return { ok: false, code, ms: Date.now() - started };
  }

  function pump() {
    while (queue.length && backgroundActive < MAX_BACKGROUND && interactiveActive === 0) {
      const job = queue.shift();
      if (!job) break;
      if (Date.now() > job.deadlineAt) {
        job.resolve({ ok: false, code: "deadline", ms: 0 });
        continue;
      }
      backgroundActive += 1;
      void runFetch(job.phrase, job.abort.signal, "background")
        .then(job.resolve)
        .finally(() => {
          backgroundActive -= 1;
          pending.delete(job.key);
          pump();
        });
    }
  }

  function enqueueBackground(phrase: VoicePhrase): Promise<ScheduledFetchResult> {
    const key = phraseKey(phrase);
    const existing = pending.get(key);
    if (existing) return existing;

    if (peekVoiceBlob(phrase.text, phrase.event)) {
      return Promise.resolve({ ok: true, blob: peekVoiceBlob(phrase.text, phrase.event)!, source: "memory", ms: 0 });
    }

    const abort = new AbortController();
    const work = new Promise<ScheduledFetchResult>((resolve) => {
      if (queue.length >= MAX_QUEUE) {
        const dropped = queue.pop();
        dropped?.resolve({ ok: false, code: "queue-full", ms: 0 });
      }
      queue.push({
        key,
        phrase,
        priority: "background",
        deadlineAt: Date.now() + BACKGROUND_DEADLINE_MS,
        resolve,
        abort,
      });
      queue.sort((a, b) => a.deadlineAt - b.deadlineAt);
      pump();
    });
    pending.set(key, work);
    return work;
  }

  async function fetchInteractive(phrase: VoicePhrase, signal?: AbortSignal): Promise<ScheduledFetchResult> {
    const key = phraseKey(phrase);
    const existing = pending.get(key);
    if (existing) return existing;

    const abort = new AbortController();
    const onAbort = () => abort.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    interactiveActive += 1;
    // Pause background work implicitly: pump won't start new background while interactiveActive > 0.
    const work = (async (): Promise<ScheduledFetchResult> => {
      try {
        return await runFetch(phrase, abort.signal, "interactive");
      } finally {
        signal?.removeEventListener("abort", onAbort);
        interactiveActive = Math.max(0, interactiveActive - 1);
        pending.delete(key);
        pump();
      }
    })();
    pending.set(key, work);
    return work;
  }

  function schedule(phrases: VoicePhrase[]) {
    for (const phrase of phrases.slice(0, 3)) {
      void enqueueBackground(phrase);
    }
  }

  function cancelBackground() {
    for (const job of queue.splice(0, queue.length)) {
      job.abort.abort();
      job.resolve({ ok: false, code: "cancelled", ms: 0 });
      pending.delete(job.key);
    }
  }

  return {
    fetchInteractive,
    schedule,
    cancelBackground,
    phraseKey,
  };
}

async function fetchLibraryClip(phrase: VoicePhrase): Promise<Blob | null> {
  if (typeof fetch === "undefined") return null;
  const base = import.meta.env.BASE_URL || "/";
  const url = `${base}voice-library/${encodeURIComponent(phrase.event)}/${hashText(phrase.text)}.wav`;
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) return null;
  return response.blob();
}

function hashText(text: string): string {
  // Short stable id for static filenames — must match server library script.
  let hash = 2166136261;
  const normalized = text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export const voiceScheduler = createVoiceScheduler();
export { hashText as voiceLibraryFileId };
