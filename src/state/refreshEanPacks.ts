import { canonicalEan } from "../domain/ean";
import { nutritionOf } from "../domain/productDraft";
import type { Adventure, SavedItem } from "../domain/types";
import { refreshBarcode, type FoundAnswer } from "../services/barcode/lookup";
import { cleanStoreImage } from "../services/images/storeImage";
import { storeImages } from "../storage/storeImages";
import type { Action } from "./reducer";

export const REFRESH_EAN_RULES = {
  maxEans: 40,
  concurrency: 3,
};

/** Unique checksum-valid EANs from Mijn producten and the open list (non-found). */
export function collectRefreshEans(mine: SavedItem[], adventure: Adventure | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw?: string) => {
    const ean = raw ? canonicalEan(raw) : null;
    if (!ean || seen.has(ean)) return;
    seen.add(ean);
    out.push(ean);
  };
  for (const item of mine) add(item.ean);
  if (adventure && adventure.phase !== "done") {
    for (const item of adventure.items) {
      if (item.status === "found") continue;
      add(item.ean);
    }
  }
  return out.slice(0, REFRESH_EAN_RULES.maxEans);
}

export function refreshActionFromAnswer(ean: string, answer: FoundAnswer): Extract<Action, { type: "refresh-ean-pack" }> {
  const product = answer.product;
  const nutrition = nutritionOf(answer);
  const ingredients = product.ingredients?.trim().slice(0, 600) || undefined;
  const offish = answer.status === "off-exact" || answer.status === "off-partial";
  return {
    type: "refresh-ean-pack",
    ean,
    ...(product.name && { name: product.name }),
    ...(product.brand !== undefined && { brand: product.brand }),
    ...(product.quantity !== undefined && { packageSize: product.quantity }),
    ...(product.imageUrl && { imageUrl: product.imageUrl }),
    ...(nutrition && { nutrition }),
    ...(ingredients !== undefined && { ingredients }),
    ...(answer.catalogProductId && { catalogProductId: answer.catalogProductId }),
    ...(answer.catalogVariantId && { catalogVariantId: answer.catalogVariantId }),
    source: offish ? "off" : "barcode",
    ...(nutrition || ingredients || product.imageUrl ? { offAttribution: true as const } : {}),
    barcode: {
      status: answer.status,
      sourceName: answer.source.name,
      sourceUrl: answer.source.url,
      at: answer.at,
    },
  };
}

export type RefreshEanResult = "updated" | "none" | "offline";

async function mapPool<T, R>(items: T[], concurrency: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await work(items[index]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** Apply a PrijsProfeet pack photo from a barcode answer and force a store-image recheck. */
export function applyStoreImageRefresh(ean: string, answer?: FoundAnswer, images: Pick<typeof storeImages, "accept" | "request"> = storeImages) {
  const cleaned = answer?.storeImage ? cleanStoreImage(answer.storeImage, ean) : null;
  if (cleaned) images.accept(ean, cleaned);
  images.request(ean, { refresh: true });
  return Boolean(cleaned);
}

/**
 * Force-refresh every collected EAN from Postgres/API (bypasses mine), dispatching refresh-ean-pack for hits.
 * Also refreshes PrijsProfeet store photos (parent photos stay; PP wins in automatic art order).
 */
export async function runRefreshEanPacks(options: {
  eans: string[];
  dispatch: (action: Action) => void;
  online?: () => boolean;
  refresh?: typeof refreshBarcode;
  storeImages?: Pick<typeof storeImages, "accept" | "request">;
}): Promise<RefreshEanResult> {
  const online = options.online ?? (() => typeof navigator === "undefined" || navigator.onLine !== false);
  const refresh = options.refresh ?? refreshBarcode;
  const images = options.storeImages ?? storeImages;
  if (!online()) return "offline";
  if (!options.eans.length) return "none";

  const outcomes = await mapPool(options.eans, REFRESH_EAN_RULES.concurrency, (ean) => refresh(ean));
  let updated = 0;
  for (let index = 0; index < outcomes.length; index += 1) {
    const ean = options.eans[index];
    const outcome = outcomes[index];
    if (outcome.status === "found") {
      options.dispatch(refreshActionFromAnswer(outcome.ean, outcome.answer));
      applyStoreImageRefresh(outcome.ean, outcome.answer, images);
      updated += 1;
      continue;
    }
    // Still recheck PP photos for known EANs even when the pack answer is a miss/error.
    applyStoreImageRefresh(ean, undefined, images);
  }
  return updated > 0 ? "updated" : "none";
}
