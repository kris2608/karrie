import { classify, type OfferMatch, type OfferProduct } from "./match.js";
import type { OfferRow, PrijsProfeet, RetailerId } from "./prijsprofeet.js";

export const OFFER_RULES = {
  cacheMs: 3 * 60 * 60_000,
  maxEntries: 2_000,
} as const;

export type OfferResult = { ok: true; match: OfferMatch } | { ok: false; code: "limit" | "unavailable" };

type Entry = { rows: OfferRow[]; until: number };
type Search = Pick<PrijsProfeet, "search">;

/** The end of a promotion's last day in the Netherlands, generously at 23:59 UTC+1. */
function endOf(day: string): number {
  return Date.parse(`${day}T23:59:59+01:00`);
}

export function nameQuery(product: OfferProduct): string {
  const name = product.name.trim();
  if (product.generic || !product.brand) return name;
  return name.toLowerCase().includes(product.brand.trim().toLowerCase()) ? name : `${product.brand.trim()} ${name}`;
}

/**
 * Finds the promotion for one product at one retailer. Search results are cached per retailer and
 * query for at most three hours and never past the earliest promotion end in them, so a family's
 * repeated lists cost one call; identical questions in flight share one call.
 */
export function createOfferLookup(provider: Search, now: () => number = Date.now) {
  const cache = new Map<string, Entry>();
  const pending = new Map<string, Promise<{ ok: true; rows: OfferRow[] } | { ok: false; code: "limit" | "ean-limit" | "unavailable" }>>();
  const stats = { hits: 0, misses: 0 };

  function remember(key: string, rows: OfferRow[]) {
    if (cache.size >= OFFER_RULES.maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    const ends = rows.flatMap((row) => (row.validUntil ? [endOf(row.validUntil)] : []));
    cache.set(key, { rows, until: Math.min(now() + OFFER_RULES.cacheMs, ...ends) });
  }

  async function rowsFor(q: string, retailer: RetailerId) {
    const key = `${retailer}|${q.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && hit.until > now()) {
      stats.hits += 1;
      return { ok: true as const, rows: hit.rows };
    }
    if (hit) cache.delete(key);
    const running = pending.get(key);
    if (running) return running;
    stats.misses += 1;
    const call = provider
      .search(q, retailer)
      .then((result) => {
        if (result.ok) remember(key, result.rows);
        return result;
      })
      .finally(() => pending.delete(key));
    pending.set(key, call);
    return call;
  }

  async function find(product: OfferProduct, retailer: RetailerId): Promise<OfferResult> {
    if (product.ean) {
      const byEan = await rowsFor(product.ean, retailer);
      if (byEan.ok) {
        const match = classify(product, byEan.rows, now());
        if (match.matchType === "exact") return { ok: true, match };
      } else if (byEan.code !== "ean-limit") {
        return { ok: false, code: byEan.code };
      }
    }
    const byName = await rowsFor(nameQuery(product), retailer);
    if (!byName.ok) return { ok: false, code: byName.code === "limit" ? "limit" : "unavailable" };
    return { ok: true, match: classify(product, byName.rows, now()) };
  }

  return { find, stats: () => ({ ...stats, entries: cache.size }) };
}

export type OfferLookup = ReturnType<typeof createOfferLookup>;
