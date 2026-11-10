import { useSyncExternalStore } from "react";
import { trackProductImageResult } from "../services/analyticsHelpers";
import { nameImageClient, type NameAnswer, type NameImageClient } from "../services/images/nameImage";
import { readKv, writeKv } from "./db";
import { createLookupStore, LOOKUP_RULES, type LookupEntry, type LookupStatus } from "./lookupStore";

/**
 * What a name search found for products the parent typed, per typed name: whether it is a brand, and a link to a
 * reliable photo of it. Only links and attribution are kept, never the photos. Every list and "Mijn producten"
 * with the same name share one answer, so a product is never searched twice on this device.
 */
export type NameImageEntry = LookupEntry<NameAnswer>;

const KV_KEY = "nameImages";
const PRIVATE_LABEL_KV = "privateLabels";

export function createNameImageStore(deps: {
  client: Pick<NameImageClient, "find">;
  now: () => number;
  load: () => Promise<Record<string, NameImageEntry> | undefined>;
  save: (entries: Record<string, NameImageEntry>) => Promise<void>;
  online: (listener: () => void) => void;
  onSettled?: (info: { key: string; outcome: "found" | "not_found" | "error" }) => void;
}) {
  return createLookupStore<NameAnswer>({ ...deps, rules: LOOKUP_RULES, found: (answer) => Boolean(answer.match) });
}

/** Private-label-only answers: found when the retailer returned at least one house-brand alternative. */
export function createPrivateLabelStore(deps: {
  client: Pick<NameImageClient, "find">;
  now: () => number;
  load: () => Promise<Record<string, NameImageEntry> | undefined>;
  save: (entries: Record<string, NameImageEntry>) => Promise<void>;
  online: (listener: () => void) => void;
  onSettled?: (info: { key: string; outcome: "found" | "not_found" | "error" }) => void;
}) {
  return createLookupStore<NameAnswer>({
    ...deps,
    rules: LOOKUP_RULES,
    found: (answer) => Boolean(answer.privateLabelAlternatives?.length),
  });
}

export type NameImageStore = ReturnType<typeof createNameImageStore>;
export type PrivateLabelStore = ReturnType<typeof createPrivateLabelStore>;

export const nameImages = createNameImageStore({
  client: nameImageClient,
  now: Date.now,
  load: () => readKv<Record<string, NameImageEntry>>(KV_KEY),
  save: (entries) => writeKv(KV_KEY, entries),
  online: (listener) => window.addEventListener("online", listener, { once: true }),
  onSettled: ({ key, outcome }) => trackProductImageResult("name", key, outcome),
});

export const privateLabelImages = createPrivateLabelStore({
  client: nameImageClient,
  now: Date.now,
  load: () => readKv<Record<string, NameImageEntry>>(PRIVATE_LABEL_KV),
  save: (entries) => writeKv(PRIVATE_LABEL_KV, entries),
  online: (listener) => window.addEventListener("online", listener, { once: true }),
  onSettled: ({ key, outcome }) => trackProductImageResult("private_label", key, outcome),
});

export function useNameAnswer(key: string | undefined): NameAnswer | null {
  return useSyncExternalStore(nameImages.subscribe, () => nameImages.value(key));
}

export function useNameImagesVersion(): number {
  return useSyncExternalStore(nameImages.subscribe, nameImages.version);
}

export function useNameImageStatus(key: string | undefined): LookupStatus {
  return useSyncExternalStore(nameImages.subscribe, () => nameImages.status(key));
}

export function usePrivateLabelAnswer(key: string | undefined): NameAnswer | null {
  return useSyncExternalStore(privateLabelImages.subscribe, () => privateLabelImages.value(key));
}
