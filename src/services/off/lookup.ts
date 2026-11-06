import { canonicalEan, type EanFormat } from "../../domain/ean";
import type { ScannedProduct } from "../../domain/types";
import { readProductCache, writeProductCache } from "../../storage/db";
import { fetchOffProduct, OffHttpError } from "./client";

export type LookupResult =
  | { status: "found"; ean: string; product: ScannedProduct; cached: boolean }
  | { status: "not-found"; ean: string }
  | { status: "invalid" }
  | { status: "offline"; ean: string }
  | { status: "error"; ean: string }
  | { status: "aborted" };

type CacheEntry = { status: "found"; product: ScannedProduct; at: number } | { status: "not-found"; at: number };

export type LookupDeps = {
  fetch: typeof fetch;
  readCache: (ean: string) => Promise<CacheEntry | undefined>;
  writeCache: (ean: string, entry: CacheEntry) => Promise<void>;
  now: () => number;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  online: () => boolean;
};

const DAY = 24 * 60 * 60 * 1000;
export const LOOKUP_RULES = {
  foundTtl: 30 * DAY,
  notFoundTtl: DAY,
  minGapMs: 700,
  retryDelays: [1000, 3000],
  maxRetryAfterMs: 10_000,
};

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    function stop() {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener("abort", stop, { once: true });
  });
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

const retryable = (error: unknown) =>
  error instanceof TypeError || (error instanceof OffHttpError && (error.status === 429 || error.status === 503));

export function createLookup(deps: LookupDeps) {
  const inFlight = new Map<string, Promise<LookupResult>>();
  let nextSlot = 0;

  async function throttle(signal?: AbortSignal) {
    const now = deps.now();
    const start = Math.max(now, nextSlot);
    nextSlot = start + LOOKUP_RULES.minGapMs;
    if (start > now) await deps.sleep(start - now, signal);
  }

  async function remote(ean: string, signal?: AbortSignal): Promise<LookupResult> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await throttle(signal);
        const result = await fetchOffProduct(ean, deps.fetch, signal);
        const at = deps.now();
        if (result.status === "found") {
          await deps.writeCache(ean, { status: "found", product: result.product, at });
          return { status: "found", ean, product: result.product, cached: false };
        }
        await deps.writeCache(ean, { status: "not-found", at });
        return { status: "not-found", ean };
      } catch (error) {
        if (isAbort(error) || signal?.aborted) return { status: "aborted" };
        if (!retryable(error) || attempt >= LOOKUP_RULES.retryDelays.length) {
          return error instanceof TypeError || !deps.online() ? { status: "offline", ean } : { status: "error", ean };
        }
        const hinted = error instanceof OffHttpError ? error.retryAfterMs : undefined;
        const delay = Math.min(hinted ?? LOOKUP_RULES.retryDelays[attempt], LOOKUP_RULES.maxRetryAfterMs);
        try {
          await deps.sleep(delay, signal);
        } catch {
          return { status: "aborted" };
        }
      }
    }
  }

  async function lookup(ean: string, signal?: AbortSignal): Promise<LookupResult> {
    const cached = await deps.readCache(ean);
    const age = cached ? deps.now() - cached.at : Infinity;
    if (cached?.status === "found" && age < LOOKUP_RULES.foundTtl) {
      return { status: "found", ean, product: cached.product, cached: true };
    }
    if (cached?.status === "not-found" && age < LOOKUP_RULES.notFoundTtl) return { status: "not-found", ean };
    if (!deps.online()) {
      return cached?.status === "found"
        ? { status: "found", ean, product: cached.product, cached: true }
        : { status: "offline", ean };
    }
    const result = await remote(ean, signal);
    if ((result.status === "offline" || result.status === "error") && cached?.status === "found") {
      return { status: "found", ean, product: cached.product, cached: true };
    }
    return result;
  }

  return function lookupProduct(input: string, options: { signal?: AbortSignal; format?: EanFormat } = {}) {
    const ean = canonicalEan(input, options.format);
    if (!ean) return Promise.resolve<LookupResult>({ status: "invalid" });
    const running = inFlight.get(ean);
    if (running) return running;
    const promise = lookup(ean, options.signal).finally(() => inFlight.delete(ean));
    inFlight.set(ean, promise);
    return promise;
  };
}

export const lookupProduct = createLookup({
  fetch: (...args) => fetch(...args),
  readCache: (ean) => readProductCache<CacheEntry>(ean),
  writeCache: (ean, entry) => writeProductCache(ean, entry),
  now: () => Date.now(),
  sleep: wait,
  online: () => typeof navigator === "undefined" || navigator.onLine !== false,
});
