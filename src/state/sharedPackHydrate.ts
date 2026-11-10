import { useEffect, useRef } from "react";
import { hasOffPhoto } from "../domain/imageIdentity";
import { nutritionOf } from "../domain/productDraft";
import type { Adventure, AdventureItem } from "../domain/types";
import { lookupBarcode } from "../services/barcode/lookup";
import type { Action, AppState } from "./reducer";

/** Shared-list (or other) items with a verified EAN that still lack OFF pack facts/photo. */
export function neededSharedPackEans(adventure: Adventure | null | undefined): { itemId: string; ean: string }[] {
  if (!adventure || (adventure.phase !== "draft" && adventure.phase !== "shopping")) return [];
  const out: { itemId: string; ean: string }[] = [];
  for (const item of adventure.items) {
    if (!needsSharedPackHydrate(item)) continue;
    out.push({ itemId: item.id, ean: item.ean! });
  }
  return out;
}

/** Whether an item still needs OFF pack hydrate (photo, nutrition, and/or confirmed catalog ids). */
export function needsSharedPackHydrate(item: AdventureItem): boolean {
  if (!item.ean) return false;
  // Parent photo locks the picture; still allow gap-fill only when nutrition/ids are missing.
  if (item.photoId && item.nutrition && item.catalogProductId) return false;
  if (item.imageChoice === "drawing" && !item.brand && !item.ean) return false;
  if (!hasOffPhoto(item) || !item.nutrition || !item.catalogProductId) return true;
  return false;
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
        const nutrition = nutritionOf(outcome.answer);
        const ingredients = product.ingredients?.trim().slice(0, 600) || undefined;
        if (!imageUrl && !product.brand && !product.quantity && !nutrition && !ingredients && !outcome.answer.catalogProductId) return;
        dispatch({
          type: "apply-shared-pack",
          itemId,
          ean,
          ...(imageUrl && { imageUrl }),
          ...(product.brand && { brand: product.brand }),
          ...(product.quantity && { packageSize: product.quantity }),
          ...(nutrition && { nutrition }),
          ...(ingredients && { ingredients }),
          ...(outcome.answer.catalogProductId && { catalogProductId: outcome.answer.catalogProductId }),
          ...(outcome.answer.catalogVariantId && { catalogVariantId: outcome.answer.catalogVariantId }),
          ...(nutrition || ingredients || imageUrl ? { offAttribution: true as const } : {}),
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
