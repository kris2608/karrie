import { useEffect, useRef } from "react";
import { hasOffPhoto } from "../domain/imageIdentity";
import type { Adventure, AdventureItem } from "../domain/types";
import { lookupBarcode } from "../services/barcode/lookup";
import type { Action, AppState } from "./reducer";

/** Shared-list (or other) items with a verified EAN that still lack an OFF front photo. */
export function neededSharedPackEans(adventure: Adventure | null | undefined): { itemId: string; ean: string }[] {
  if (!adventure || (adventure.phase !== "draft" && adventure.phase !== "shopping")) return [];
  const out: { itemId: string; ean: string }[] = [];
  for (const item of adventure.items) {
    if (!needsSharedPackHydrate(item)) continue;
    out.push({ itemId: item.id, ean: item.ean! });
  }
  return out;
}

/** Test helper: whether an item still needs OFF pack hydrate. */
export function needsSharedPackHydrate(item: AdventureItem): boolean {
  if (!item.ean || item.kind === "custom_generic") return false;
  if (item.photoId || hasOffPhoto(item)) return false;
  if (item.imageChoice === "drawing" && !item.brand && !item.ean) return false;
  return true;
}

/**
 * Background barcode hydrate for imported shared items: attach trusted OFF imageUrl/brand when the EAN matches.
 * Non-blocking; skips items that already have a commercial photo.
 */
export function useSharedPackHydrate(state: AppState, dispatch: (action: Action) => void, ready: boolean) {
  const tried = useRef(new Set<string>());
  const latest = useRef(state);
  latest.current = state;
  const targetKey = neededSharedPackEans(state.adventure)
    .map((entry) => `${entry.itemId}:${entry.ean}`)
    .join("|");

  useEffect(() => {
    if (!ready || !targetKey) return;
    let cancelled = false;
    const targets = neededSharedPackEans(latest.current.adventure);

    for (const { itemId, ean } of targets) {
      const key = `${itemId}:${ean}`;
      if (tried.current.has(key)) continue;
      tried.current.add(key);
      void lookupBarcode(ean, latest.current.mine).then((outcome) => {
        if (cancelled || outcome.status !== "found") return;
        const product = outcome.answer.product;
        const imageUrl = product.imageUrl;
        if (!imageUrl && !product.brand && !product.quantity) return;
        dispatch({
          type: "apply-shared-pack",
          itemId,
          ean,
          ...(imageUrl && { imageUrl }),
          ...(product.brand && { brand: product.brand }),
          ...(product.quantity && { packageSize: product.quantity }),
          barcode: {
            status: outcome.answer.status,
            sourceName: outcome.answer.source.name,
            sourceUrl: outcome.answer.source.url,
            at: outcome.answer.at,
          },
        });
      });
    }

    return () => {
      cancelled = true;
    };
  }, [ready, targetKey, dispatch]);
}
