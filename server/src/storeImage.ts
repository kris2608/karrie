import type { CatalogStore, StoreImageInput } from "./catalog/types.js";
import { eanForms } from "./ean.js";
import { RETAILER_RANK, type OfferRow, type PrijsProfeet, type SourceRetailer } from "./offers/prijsprofeet.js";

/**
 * A retailer's product photo for one exact barcode, found through PrijsProfeet's free search. Only a link: the
 * photo stays on the retailer's server and belongs to the retailer. A similar name is never enough.
 */
export type StoreImage = {
  ean: string;
  imageUrl: string;
  retailer: SourceRetailer;
  sourceUrl?: string;
  quantity?: string;
  productName?: string;
  brand?: string;
};

/** Exact-EAN rows from PrijsProfeet, with or without a photo; used for pack evidence and identity. */
export type StoreImageHit = {
  image: StoreImage | null;
  rows: OfferRow[];
};

export type StoreImageResult =
  | { ok: true; image: StoreImage | null; rows: OfferRow[]; cached: boolean }
  | { ok: false; code: "limit" | "unavailable" };

const DAY = 24 * 60 * 60 * 1000;
export const STORE_IMAGE_RULES = {
  foundTtlMs: 14 * DAY,
  /** Promotions change weekly, so a miss is asked again sooner. */
  missTtlMs: DAY,
  errorTtlMs: 5 * 60 * 1000,
  cacheEntries: 5_000,
};

type Entry = { result: StoreImageResult; until: number };

function exactRows(ean: string, rows: OfferRow[]): OfferRow[] {
  const forms = eanForms(ean);
  return rows.filter((candidate) => candidate.ean && forms.includes(candidate.ean.replace(/^0+(?=\d{13})/, "")));
}

function pickImage(ean: string, rows: OfferRow[], prefer?: string): StoreImage | null {
  const withPhoto = rows.filter((row) => row.imageUrl);
  if (!withPhoto.length) return null;
  const ranked = [...withPhoto].sort((a, b) => {
    if (prefer) {
      if (a.retailer === prefer && b.retailer !== prefer) return -1;
      if (b.retailer === prefer && a.retailer !== prefer) return 1;
    }
    return (RETAILER_RANK[a.retailer] ?? 99) - (RETAILER_RANK[b.retailer] ?? 99);
  });
  const row = ranked[0];
  return {
    ean,
    imageUrl: row.imageUrl!,
    retailer: row.retailer,
    ...(row.sourceUrl && { sourceUrl: row.sourceUrl }),
    ...(row.quantity && { quantity: row.quantity }),
    ...(row.productName && { productName: row.productName }),
    ...(row.brand && { brand: row.brand }),
  };
}

function fromStored(ean: string, stored: StoreImageInput): StoreImage {
  return {
    ean,
    imageUrl: stored.imageUrl,
    retailer: stored.retailer,
    ...(stored.sourceUrl && { sourceUrl: stored.sourceUrl }),
    ...(stored.quantity && { quantity: stored.quantity }),
    ...(stored.productName && { productName: stored.productName }),
    ...(stored.brand && { brand: stored.brand }),
  };
}

export function createStoreImageLookup(
  provider: Pick<PrijsProfeet, "searchImage">,
  now: () => number = Date.now,
  catalog?: Pick<CatalogStore, "storeImageByGtin" | "upsertStoreImage" | "recordRetailerPack">,
) {
  const cache = new Map<string, Entry>();
  const pending = new Map<string, Promise<StoreImageResult>>();
  const stats = { hits: 0, misses: 0 };

  function cacheKey(ean: string, prefer?: string) {
    return prefer ? `${ean}|${prefer}` : ean;
  }

  function remember(key: string, result: StoreImageResult, ttl: number) {
    cache.delete(key);
    if (cache.size >= STORE_IMAGE_RULES.cacheEntries) cache.delete(cache.keys().next().value as string);
    cache.set(key, { result, until: now() + ttl });
  }

  async function persist(ean: string, rows: OfferRow[], image: StoreImage | null) {
    if (!catalog || !rows.length) return;
    /** Await pack evidence so the barcode answer can prefer PrijsProfeet size on the first reply. */
    await catalog.recordRetailerPack({
      ean,
      rows: rows.map((row) => ({
        retailer: row.retailer,
        quantity: row.quantity,
        productName: row.productName,
        brand: row.brand,
      })),
    });
    if (image) {
      void catalog.upsertStoreImage({
        ean,
        imageUrl: image.imageUrl,
        retailer: image.retailer,
        sourceUrl: image.sourceUrl,
        quantity: image.quantity,
        productName: image.productName,
        brand: image.brand,
      });
    }
  }

  async function fresh(ean: string, prefer?: string): Promise<StoreImageResult> {
    if (catalog) {
      const stored = await catalog.storeImageByGtin(ean, prefer).catch(() => null);
      if (stored) {
        const image = fromStored(ean, stored);
        const result: StoreImageResult = { ok: true, image, rows: [], cached: true };
        remember(cacheKey(ean, prefer), result, STORE_IMAGE_RULES.foundTtlMs);
        return result;
      }
    }
    const answer = await provider.searchImage(ean);
    if (!answer.ok) {
      const result: StoreImageResult = { ok: false, code: answer.code === "unavailable" ? "unavailable" : "limit" };
      if (answer.code === "unavailable") remember(cacheKey(ean, prefer), result, STORE_IMAGE_RULES.errorTtlMs);
      return result;
    }
    const rows = exactRows(ean, answer.rows);
    const image = pickImage(ean, rows, prefer);
    await persist(ean, rows, image);
    const result: StoreImageResult = { ok: true, image, rows, cached: false };
    remember(cacheKey(ean, prefer), result, rows.length ? STORE_IMAGE_RULES.foundTtlMs : STORE_IMAGE_RULES.missTtlMs);
    /** Also cache the bare EAN so barcode lookup and a later photo request share one upstream call. */
    if (prefer) remember(ean, { ok: true, image: pickImage(ean, rows), rows, cached: false }, rows.length ? STORE_IMAGE_RULES.foundTtlMs : STORE_IMAGE_RULES.missTtlMs);
    return result;
  }

  /** A cached answer or remembered recent error, or nothing; never calls PrijsProfeet. */
  function cached(ean: string, prefer?: string): StoreImageResult | null {
    const entry = cache.get(cacheKey(ean, prefer)) ?? cache.get(ean);
    if (!entry || entry.until <= now()) return null;
    if (!entry.result.ok) return entry.result;
    const image = entry.result.rows.length ? pickImage(ean, entry.result.rows, prefer) : entry.result.image;
    return { ...entry.result, image, cached: true };
  }

  return {
    cached,
    find(ean: string, prefer?: string): Promise<StoreImageResult> {
      const known = cached(ean, prefer);
      if (known) {
        stats.hits += 1;
        return Promise.resolve(known);
      }
      const key = cacheKey(ean, prefer);
      const running = pending.get(key) ?? pending.get(ean);
      if (running) {
        return running.then((result) => {
          if (!result.ok) return result;
          return { ...result, image: result.rows.length ? pickImage(ean, result.rows, prefer) : result.image };
        });
      }
      stats.misses += 1;
      const promise = fresh(ean, prefer).finally(() => {
        pending.delete(key);
        pending.delete(ean);
      });
      pending.set(key, promise);
      pending.set(ean, promise);
      return promise;
    },
    stats: () => ({ ...stats, entries: cache.size }),
  };
}

export type StoreImageLookup = ReturnType<typeof createStoreImageLookup>;
