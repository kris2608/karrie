import { useSyncExternalStore } from "react";
import { storeImageClient, type StoreImage, type StoreImageClient, type StoreImageOutcome } from "../services/images/storeImage";
import { readKv, writeKv } from "./db";
import { createLookupStore, LOOKUP_RULES, nextEntry, type LookupEntry, type LookupStatus } from "./lookupStore";

/**
 * Retailer photos per scanned barcode, found through PrijsProfeet. Only the link is kept, never the photo itself:
 * it belongs to the retailer. Keyed by barcode, so every list and "Mijn producten" with that code share it.
 */
export type StoreImageEntry = LookupEntry<StoreImage>;

export const STORE_IMAGE_RULES = LOOKUP_RULES;

const KV_KEY = "storeImages";

export { due } from "./lookupStore";

export function afterOutcome(previous: StoreImageEntry | undefined, outcome: StoreImageOutcome, now: number): StoreImageEntry | undefined {
  return nextEntry(previous, outcome, now, STORE_IMAGE_RULES);
}

export type StoreImageStatus = LookupStatus;

export function createStoreImageStore(deps: {
  client: Pick<StoreImageClient, "find">;
  now: () => number;
  load: () => Promise<Record<string, StoreImageEntry> | undefined>;
  save: (entries: Record<string, StoreImageEntry>) => Promise<void>;
  online: (listener: () => void) => void;
}) {
  return createLookupStore<StoreImage>({ ...deps, rules: STORE_IMAGE_RULES });
}

export type StoreImageStore = ReturnType<typeof createStoreImageStore>;

/** Shopping-list supermarket: prefers that retailer's photo when several exact-EAN hits exist. */
let preferredRetailer: string | undefined;
export function setStoreImageRetailer(retailer?: string) {
  preferredRetailer = retailer;
}

export const storeImages = createStoreImageStore({
  client: {
    find: (ean) => storeImageClient.find(ean, preferredRetailer),
  },
  now: Date.now,
  load: () => readKv<Record<string, StoreImageEntry>>(KV_KEY),
  save: (entries) => writeKv(KV_KEY, entries),
  online: (listener) => window.addEventListener("online", listener, { once: true }),
});

export function useStoreImage(ean: string | undefined): StoreImage | null {
  return useSyncExternalStore(storeImages.subscribe, () => storeImages.image(ean));
}

export function useStoreImagesVersion(): number {
  return useSyncExternalStore(storeImages.subscribe, storeImages.version);
}

export function useStoreImageStatus(ean: string | undefined): StoreImageStatus {
  return useSyncExternalStore(storeImages.subscribe, () => storeImages.status(ean));
}
