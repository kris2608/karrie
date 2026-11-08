import type { CatalogStore } from "./catalog/types.js";
import { eanForms } from "./ean.js";
import type { PrijsProfeet, RetailerId } from "./offers/prijsprofeet.js";

/**
 * A retailer's product photo for one exact barcode, found through PrijsProfeet's free search. Only a link: the
 * photo stays on the retailer's server and belongs to the retailer. A similar name is never enough.
 */
export type StoreImage = { ean: string; imageUrl: string; retailer: RetailerId; sourceUrl?: string };

export type StoreImageResult = { ok: true; image: StoreImage | null; cached: boolean } | { ok: false; code: "limit" | "unavailable" };

const DAY = 24 * 60 * 60 * 1000;
export const STORE_IMAGE_RULES = {
  foundTtlMs: 14 * DAY,
  /** Promotions change weekly, so a miss is asked again sooner. */
  missTtlMs: DAY,
  errorTtlMs: 5 * 60 * 1000,
  cacheEntries: 5_000,
};

type Entry = { result: StoreImageResult; until: number };

export function createStoreImageLookup(
  provider: Pick<PrijsProfeet, "searchImage">,
  now: () => number = Date.now,
  catalog?: Pick<CatalogStore, "storeImageByGtin" | "upsertStoreImage">,
) {
  const cache = new Map<string, Entry>();
  const pending = new Map<string, Promise<StoreImageResult>>();
  const stats = { hits: 0, misses: 0 };

  function remember(ean: string, result: StoreImageResult, ttl: number) {
    cache.delete(ean);
    if (cache.size >= STORE_IMAGE_RULES.cacheEntries) cache.delete(cache.keys().next().value as string);
    cache.set(ean, { result, until: now() + ttl });
  }

  async function fresh(ean: string): Promise<StoreImageResult> {
    if (catalog) {
      const stored = await catalog.storeImageByGtin(ean).catch(() => null);
      if (stored) {
        const image: StoreImage = {
          ean,
          imageUrl: stored.imageUrl,
          retailer: stored.retailer as RetailerId,
          ...(stored.sourceUrl && { sourceUrl: stored.sourceUrl }),
        };
        remember(ean, { ok: true, image, cached: true }, STORE_IMAGE_RULES.foundTtlMs);
        return { ok: true, image, cached: true };
      }
    }
    const answer = await provider.searchImage(ean);
    if (!answer.ok) {
      const result: StoreImageResult = { ok: false, code: answer.code === "unavailable" ? "unavailable" : "limit" };
      if (answer.code === "unavailable") remember(ean, result, STORE_IMAGE_RULES.errorTtlMs);
      return result;
    }
    const forms = eanForms(ean);
    const row = answer.rows.find((candidate) => candidate.ean && forms.includes(candidate.ean.replace(/^0+(?=\d{13})/, "")) && candidate.imageUrl);
    const image: StoreImage | null = row ? { ean, imageUrl: row.imageUrl!, retailer: row.retailer, ...(row.sourceUrl && { sourceUrl: row.sourceUrl }) } : null;
    if (image && catalog) {
      void catalog.upsertStoreImage({ ean, imageUrl: image.imageUrl, retailer: image.retailer, sourceUrl: image.sourceUrl });
    }
    remember(ean, { ok: true, image, cached: false }, image ? STORE_IMAGE_RULES.foundTtlMs : STORE_IMAGE_RULES.missTtlMs);
    return { ok: true, image, cached: false };
  }

  /** A cached answer or remembered recent error, or nothing; never calls PrijsProfeet. */
  function cached(ean: string): StoreImageResult | null {
    const entry = cache.get(ean);
    if (!entry || entry.until <= now()) return null;
    return entry.result.ok ? { ...entry.result, cached: true } : entry.result;
  }

  return {
    cached,
    find(ean: string): Promise<StoreImageResult> {
      const known = cached(ean);
      if (known) {
        stats.hits += 1;
        return Promise.resolve(known);
      }
      const running = pending.get(ean);
      if (running) return running;
      stats.misses += 1;
      const promise = fresh(ean).finally(() => pending.delete(ean));
      pending.set(ean, promise);
      return promise;
    },
    stats: () => ({ ...stats, entries: cache.size }),
  };
}

export type StoreImageLookup = ReturnType<typeof createStoreImageLookup>;
