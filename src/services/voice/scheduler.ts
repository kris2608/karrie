import type { VoicePhrase } from "../../domain/voiceScripts";
import { ensureVoiceCacheConfig, peekVoiceBlob, readVoiceBlob, writeVoiceBlob, evictVoiceBlob } from "./cache";
import { voiceClient, type VoiceFetchResult } from "./client";
import { fetchManifestLibraryClip, assertValidWav } from "./libraryClient";

export type FetchPriority = "interactive" | "background";

export type ScheduledFetchResult =
  | { ok: true; blob: Blob; source: "memory" | "cache" | "server" | "library"; ms: number }
  | { ok: false; code: string; ms: number };

type Job = {
  key: string;
  phrase: VoicePhrase & { productId?: string };
  priority: FetchPriority;
  deadlineAt: number;
  resolve: (result: ScheduledFetchResult) => void;
  abort: AbortController;
};

const MAX_BACKGROUND = 1;
/** Start line, celebration, and the next two product lines. */
const MAX_QUEUE = 4;
const BACKGROUND_DEADLINE_MS = 12_000;
const INTERACTIVE_DEADLINE_MS = 12_000;

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

  function settleJob(job: Job, result: ScheduledFetchResult) {
    pending.delete(job.key);
    job.resolve(result);
  }

  async function runFetch(
    phrase: VoicePhrase & { productId?: string },
    signal: AbortSignal,
    priority: FetchPriority,
  ): Promise<ScheduledFetchResult> {
    const started = Date.now();
    if (signal.aborted) return { ok: false, code: "cancelled", ms: 0 };

    // Kick config refresh without blocking local/library hits.
    void ensureVoiceCacheConfig();

    const warm = peekVoiceBlob(phrase.text, phrase.event);
    if (warm) {
      if (await assertValidWav(warm)) {
        return { ok: true, blob: warm, source: "memory", ms: Date.now() - started };
      }
      await evictVoiceBlob(phrase.text, phrase.event);
    }
    if (signal.aborted) return { ok: false, code: "cancelled", ms: Date.now() - started };

    // Bundled catalog library via manifest — never invent hashed paths.
    try {
      const lib = await fetchManifestLibraryClip(phrase);
      if (lib) {
        await writeVoiceBlob(phrase.text, lib.blob, phrase.event);
        return { ok: true, blob: lib.blob, source: "library", ms: Date.now() - started };
      }
    } catch {
      // ignore library miss
    }
    if (signal.aborted) return { ok: false, code: "cancelled", ms: Date.now() - started };

    // Cache API may need config for namespace — await only here.
    await ensureVoiceCacheConfig();
    if (signal.aborted) return { ok: false, code: "cancelled", ms: Date.now() - started };

    const cached = await readVoiceBlob(phrase.text, phrase.event);
    if (cached) {
      if (await assertValidWav(cached)) {
        return { ok: true, blob: cached, source: "cache", ms: Date.now() - started };
      }
      await evictVoiceBlob(phrase.text, phrase.event);
    }
    if (signal.aborted) return { ok: false, code: "cancelled", ms: Date.now() - started };

    const result: VoiceFetchResult = await voiceClient.fetchClip(phrase.event, phrase.text, {
      priority,
      signal,
    });
    if (signal.aborted) return { ok: false, code: "cancelled", ms: Date.now() - started };
    if (result.status === "ok") {
      if (!(await assertValidWav(result.blob))) {
        return { ok: false, code: "invalid-audio", ms: Date.now() - started };
      }
      return { ok: true, blob: result.blob, source: "server", ms: Date.now() - started };
    }
    const code =
      result.status === "limit" || result.status === "error"
        ? result.code
        : result.status === "offline"
          ? "offline"
          : result.status;
    return { ok: false, code, ms: Date.now() - started };
  }

  function pump() {
    while (queue.length && backgroundActive < MAX_BACKGROUND && interactiveActive === 0) {
      const job = queue.shift();
      if (!job) break;
      if (Date.now() > job.deadlineAt) {
        settleJob(job, { ok: false, code: "deadline", ms: 0 });
        continue;
      }
      backgroundActive += 1;
      void runFetch(job.phrase, job.abort.signal, "background")
        .then((result) => settleJob(job, result))
        .finally(() => {
          backgroundActive -= 1;
          pending.delete(job.key);
          pump();
        });
    }
  }

  function dequeue(key: string): Job | null {
    const index = queue.findIndex((job) => job.key === key);
    if (index < 0) return null;
    return queue.splice(index, 1)[0] ?? null;
  }

  function enqueueBackground(phrase: VoicePhrase & { productId?: string }): Promise<ScheduledFetchResult> {
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
        if (dropped) {
          dropped.abort.abort();
          settleJob(dropped, { ok: false, code: "queue-full", ms: 0 });
        }
      }
      const job: Job = {
        key,
        phrase,
        priority: "background",
        deadlineAt: Date.now() + BACKGROUND_DEADLINE_MS,
        resolve,
        abort,
      };
      queue.push(job);
      queue.sort((a, b) => a.deadlineAt - b.deadlineAt);
      pump();
    });
    pending.set(key, work);
    return work;
  }

  async function fetchInteractive(
    phrase: VoicePhrase & { productId?: string },
    signal?: AbortSignal,
  ): Promise<ScheduledFetchResult> {
    const key = phraseKey(phrase);

    // Promote queued background job to interactive.
    const queued = dequeue(key);
    if (queued) {
      queued.abort.abort();
      pending.delete(key);
      queued.resolve({ ok: false, code: "promoted", ms: 0 });
    }

    const existing = pending.get(key);
    if (existing) return existing;

    const abort = new AbortController();
    const onAbort = () => abort.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const deadline = setTimeout(() => abort.abort(), INTERACTIVE_DEADLINE_MS);

    interactiveActive += 1;
    const work = (async (): Promise<ScheduledFetchResult> => {
      try {
        const result = await runFetch(phrase, abort.signal, "interactive");
        if (abort.signal.aborted && result.ok === false && result.code === "cancelled") {
          return { ok: false, code: "deadline", ms: result.ms };
        }
        return result;
      } finally {
        clearTimeout(deadline);
        signal?.removeEventListener("abort", onAbort);
        interactiveActive = Math.max(0, interactiveActive - 1);
        pending.delete(key);
        pump();
      }
    })();
    pending.set(key, work);
    return work;
  }

  function schedule(phrases: Array<VoicePhrase & { productId?: string }>) {
    for (const phrase of phrases.slice(0, MAX_QUEUE)) {
      void enqueueBackground(phrase);
    }
  }

  function cancelBackground() {
    for (const job of queue.splice(0, queue.length)) {
      job.abort.abort();
      settleJob(job, { ok: false, code: "cancelled", ms: 0 });
    }
  }

  return {
    fetchInteractive,
    schedule,
    cancelBackground,
    phraseKey,
  };
}

export const voiceScheduler = createVoiceScheduler();
