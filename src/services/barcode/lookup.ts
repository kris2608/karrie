import { canonicalEan, sameEan } from "../../domain/ean";
import type { SavedItem } from "../../domain/types";
import { readProductCache, writeProductCache } from "../../storage/db";
import { cleanAnswer, type BarcodeAnswer } from "./normalize";

export type FoundAnswer = Extract<BarcodeAnswer, { product: unknown }>;

export type BarcodeOutcome =
  | { status: "mine"; ean: string; item: SavedItem }
  | { status: "found"; ean: string; answer: FoundAnswer; cached: boolean }
  | { status: "none"; ean: string }
  | { status: "offline"; ean: string }
  | { status: "limit"; ean: string; code: string }
  | { status: "error"; ean: string; code: string };

type CacheEntry = { answer: BarcodeAnswer; savedAt: number };

const DAY = 24 * 60 * 60 * 1000;
export const BARCODE_CLIENT_RULES = {
  foundTtlMs: 30 * DAY,
  /** Conflicted pack sizes should not stick for a month after the catalog is repaired. */
  conflictTtlMs: DAY,
  /** When online, refresh a still-fresh cache entry after this age so central repairs arrive. */
  revalidateAfterMs: 6 * 60 * 60 * 1000,
  /** The server remembers misses for a week; a day here lets a newly added Open Food Facts record show up sooner. */
  missTtlMs: DAY,
  /** A sleeping Render instance can take half a minute to answer. */
  timeoutMs: 45_000,
};

const LIMIT_CODES = new Set(["rate-limited", "daily-limit", "budget"]);

export type BarcodeDeps = {
  fetch: typeof fetch;
  online: () => boolean;
  origin: string;
  now: () => number;
  readCache: (ean: string) => Promise<CacheEntry | undefined>;
  writeCache: (ean: string, entry: CacheEntry) => Promise<void>;
};

export function createBarcodeLookup(deps: BarcodeDeps) {
  const inFlight = new Map<string, Promise<BarcodeOutcome>>();

  async function remote(ean: string, stale: CacheEntry | undefined): Promise<BarcodeOutcome> {
    const fallback = (outcome: BarcodeOutcome): BarcodeOutcome =>
      stale && stale.answer.status !== "none" ? { status: "found", ean, answer: stale.answer, cached: true } : outcome;
    if (!deps.online()) return fallback({ status: "offline", ean });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BARCODE_CLIENT_RULES.timeoutMs);
    try {
      const response = await deps.fetch(`${deps.origin.replace(/\/$/, "")}/api/products/barcode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ean }),
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as { status?: string; code?: string; answer?: unknown } | null;
      const answer = response.ok && body?.status === "ok" ? cleanAnswer(body.answer, ean) : null;
      if (!answer) {
        const code = body?.code ?? `http-${response.status}`;
        return fallback(LIMIT_CODES.has(code) ? { status: "limit", ean, code } : { status: "error", ean, code });
      }
      await deps.writeCache(ean, { answer, savedAt: deps.now() });
      return answer.status === "none" ? { status: "none", ean } : { status: "found", ean, answer, cached: false };
    } catch {
      return fallback(deps.online() ? { status: "error", ean, code: controller.signal.aborted ? "timeout" : "unreachable" } : { status: "offline", ean });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function lookup(ean: string): Promise<BarcodeOutcome> {
    const entry = await deps.readCache(ean);
    const cached = entry && cleanAnswer(entry.answer, ean);
    const age = entry ? deps.now() - entry.savedAt : Infinity;
    if (cached && cached.status !== "none") {
      const ttl = cached.pack?.conflict ? BARCODE_CLIENT_RULES.conflictTtlMs : BARCODE_CLIENT_RULES.foundTtlMs;
      if (age < ttl) {
        if (deps.online() && age > BARCODE_CLIENT_RULES.revalidateAfterMs) {
          void remote(ean, entry).catch(() => undefined);
        }
        return { status: "found", ean, answer: cached, cached: true };
      }
    }
    if (cached?.status === "none" && age < BARCODE_CLIENT_RULES.missTtlMs) return { status: "none", ean };
    return remote(ean, cached && entry ? { answer: cached, savedAt: entry.savedAt } : undefined);
  }

  /** My products first: what a parent confirmed for this code wins over anything a database says. */
  return function lookupBarcode(code: string, mine: SavedItem[]): Promise<BarcodeOutcome> {
    const ean = canonicalEan(code);
    if (!ean) return Promise.resolve({ status: "error", ean: code, code: "invalid" });
    const own = mine.find((entry) => sameEan(entry.ean, ean));
    if (own) return Promise.resolve({ status: "mine", ean, item: own });
    const running = inFlight.get(ean);
    if (running) return running;
    const promise = lookup(ean).finally(() => inFlight.delete(ean));
    inFlight.set(ean, promise);
    return promise;
  };
}

export const lookupBarcode = createBarcodeLookup({
  fetch: (...args) => fetch(...args),
  online: () => typeof navigator === "undefined" || navigator.onLine !== false,
  origin: import.meta.env.VITE_API_ORIGIN ?? "",
  now: Date.now,
  readCache: (ean) => readProductCache<CacheEntry>(ean),
  writeCache: (ean, entry) => writeProductCache(ean, entry),
});
