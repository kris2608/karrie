import { hasOffPhoto, identityKey, identityOf, wantsReference, wantsStoreImage, type ImageIdentity } from "./imageIdentity";
import type { Adventure } from "./types";

/** Whether a retailer photo is known for a barcode: found, none, or still being looked up. */
export type StoreImageStatusOf = (ean: string) => "found" | "none" | "pending";

/**
 * Products on the current list to look up: every branded pack (its page facts are kept even when the parent pinned
 * a photo or drawing), and standard products a parent asked a picture for. A pack with an Open Food Facts front photo
 * or a retailer photo for its barcode already has its picture, so it is only looked up on request or not at all. A
 * scanned pack waits until its retailer photo lookup has answered, so nothing is searched twice.
 */
export function wantedReferences(adventure: Adventure | null, storeStatus: StoreImageStatusOf = () => "none"): ImageIdentity[] {
  if (!adventure || adventure.phase === "done") return [];
  const wanted = new Map<string, ImageIdentity>();
  for (const item of adventure.items) {
    const identity = identityOf(item);
    if (!identity) continue;
    const offPhoto = hasOffPhoto(item);
    const store = wantsStoreImage(item) ? storeStatus(item.ean!) : "none";
    if (store === "pending") continue;
    const storePhoto = store === "found";
    if ((!identity.generic && !offPhoto && !storePhoto) || wantsReference(identity, item.imageChoice, offPhoto, storePhoto)) wanted.set(identityKey(identity), identity);
  }
  return [...wanted.values()];
}

/** Scanned packs on the current list that may have a retailer photo for their barcode. */
export function wantedStoreImages(adventure: Adventure | null): string[] {
  if (!adventure || adventure.phase === "done") return [];
  return [...new Set(adventure.items.filter(wantsStoreImage).map((item) => item.ean!))];
}
