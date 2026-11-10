import { useEffect, useRef, useState } from "react";
import { hasOffPhoto } from "../domain/imageIdentity";
import { nutritionOf } from "../domain/productDraft";
import type { Adventure, AdventureItem } from "../domain/types";
import { lookupBarcode, type BarcodeOutcome } from "../services/barcode/lookup";
import { LOOKUP_RULES } from "../storage/lookupStore";
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

export type HydrateAttempt = {
  status: "pending" | "complete" | "miss" | "retry";
  attempts: number;
  retryAt: number;
};

const MAX_ATTEMPTS = 8;

export function hydrateKey(itemId: string, ean: string): string {
  return `${itemId}:${ean}`;
}

/** Next attempt state after a barcode outcome. Durable misses stop; transient failures back off. */
export function nextHydrateAttempt(previous: HydrateAttempt | undefined, outcome: BarcodeOutcome, now: number): HydrateAttempt {
  const attempts = (previous?.attempts ?? 0) + 1;
  switch (outcome.status) {
    case "found":
    case "mine":
      return { status: "complete", attempts, retryAt: Number.POSITIVE_INFINITY };
    case "none":
      return { status: "miss", attempts, retryAt: now + LOOKUP_RULES.noneRetryMs };
    case "limit":
      return { status: "retry", attempts, retryAt: now + LOOKUP_RULES.limitRetryMs };
    case "offline":
    case "error": {
      if (attempts >= MAX_ATTEMPTS) return { status: "miss", attempts, retryAt: Number.POSITIVE_INFINITY };
      const delay = Math.min(LOOKUP_RULES.errorMaxMs, LOOKUP_RULES.errorBaseMs * 4 ** Math.max(0, attempts - 1));
      return { status: "retry", attempts, retryAt: now + delay };
    }
  }
}

export function shouldAttemptHydrate(entry: HydrateAttempt | undefined, now: number): boolean {
  if (!entry) return true;
  if (entry.status === "complete" || entry.status === "miss" || entry.status === "pending") return false;
  return entry.retryAt <= now;
}

type Lookup = typeof lookupBarcode;

/**
 * Background barcode hydrate for imported shared items: attach trusted OFF imageUrl/brand when the EAN matches.
 * Non-blocking; retries temporary failures with backoff and when connectivity returns.
 */
export function useSharedPackHydrate(
  state: AppState,
  dispatch: (action: Action) => void,
  ready: boolean,
  lookup: Lookup = lookupBarcode,
  now: () => number = () => Date.now(),
) {
  const attempts = useRef(new Map<string, HydrateAttempt>());
  const inflight = useRef(new Set<string>());
  const latest = useRef(state);
  const dispatchRef = useRef(dispatch);
  const lookupRef = useRef(lookup);
  const nowRef = useRef(now);
  latest.current = state;
  dispatchRef.current = dispatch;
  lookupRef.current = lookup;
  nowRef.current = now;

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const [wake, setWake] = useState(0);
  const targetKey = neededSharedPackEans(state.adventure)
    .map((entry) => `${entry.itemId}:${entry.ean}`)
    .join("|");

  useEffect(() => {
    mounted.current = true;
    const onOnline = () => {
      for (const [key, entry] of attempts.current) {
        if (entry.status === "retry") attempts.current.set(key, { ...entry, retryAt: nowRef.current() });
      }
      setWake((value) => value + 1);
    };
    window.addEventListener("online", onOnline);
    return () => {
      mounted.current = false;
      clearTimeout(timerRef.current);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;

    const scheduleWake = () => {
      clearTimeout(timerRef.current);
      let nextRetryAt = Number.POSITIVE_INFINITY;
      for (const entry of attempts.current.values()) {
        if (entry.status === "retry") nextRetryAt = Math.min(nextRetryAt, entry.retryAt);
      }
      if (!Number.isFinite(nextRetryAt)) return;
      timerRef.current = setTimeout(() => {
        if (mounted.current) setWake((value) => value + 1);
      }, Math.max(0, nextRetryAt - nowRef.current()));
    };

    const applyFound = (itemId: string, ean: string, outcome: Extract<BarcodeOutcome, { status: "found" }>) => {
      const product = outcome.answer.product;
      const imageUrl = product.imageUrl;
      const nutrition = nutritionOf(outcome.answer);
      const ingredients = product.ingredients?.trim().slice(0, 600) || undefined;
      if (!imageUrl && !product.brand && !product.quantity && !nutrition && !ingredients && !outcome.answer.catalogProductId) return;
      dispatchRef.current({
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
    };

    const targets = neededSharedPackEans(latest.current.adventure);
    const activeKeys = new Set(targets.map((entry) => hydrateKey(entry.itemId, entry.ean)));
    for (const key of [...attempts.current.keys()]) {
      if (!activeKeys.has(key)) {
        attempts.current.delete(key);
        inflight.current.delete(key);
      }
    }

    const at = nowRef.current();
    for (const { itemId, ean } of targets) {
      const key = hydrateKey(itemId, ean);
      if (!shouldAttemptHydrate(attempts.current.get(key), at) || inflight.current.has(key)) continue;

      const previous = attempts.current.get(key);
      attempts.current.set(key, { status: "pending", attempts: previous?.attempts ?? 0, retryAt: at });
      inflight.current.add(key);
      void lookupRef.current(ean, latest.current.mine)
        .then((outcome) => {
          if (!mounted.current) return;
          // Drop results for keys that left the list while the request was running.
          if (!attempts.current.has(key) && !neededSharedPackEans(latest.current.adventure).some((entry) => hydrateKey(entry.itemId, entry.ean) === key)) {
            return;
          }
          const next = nextHydrateAttempt(attempts.current.get(key), outcome, nowRef.current());
          attempts.current.set(key, next);
          if (outcome.status === "found") applyFound(itemId, ean, outcome);
          if (next.status === "retry") scheduleWake();
        })
        .finally(() => {
          inflight.current.delete(key);
        });
    }

    scheduleWake();
  }, [ready, targetKey, wake]);
}
