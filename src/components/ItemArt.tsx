import { useSyncExternalStore } from "react";
import { hasOffPhoto, identityOf, nameImageKey, wantsNameImage, wantsReference, wantsStoreImage } from "../domain/imageIdentity";
import type { ImageSource, NamePhoto, PackInfo } from "../domain/types";
import type { StoreImage } from "../services/images/storeImage";
import { useNameAnswer } from "../storage/nameImages";
import { usePhotoUrl } from "../storage/photos";
import { useReferenceUrl } from "../storage/references";
import { useStoreImage } from "../storage/storeImages";
import { ProductArt } from "./ProductArt";

type ArtItem = Pick<
  PackInfo,
  "ean" | "kind" | "imageUrl" | "imageKind" | "imageSource" | "photoId" | "imageChoice" | "brand" | "packageSize" | "source" | "recognition" | "illustrationId" | "namePhoto"
> & {
  icon: string;
  name: string;
};

export function hasPhoto(item: Pick<PackInfo, "imageUrl" | "imageKind" | "photoId">): boolean {
  return item.imageKind === "photo" && Boolean(item.photoId || item.imageUrl);
}

/**
 * Where a shown picture came from: Open Food Facts, a retailer via PrijsProfeet (exact barcode), a photo found by a
 * typed product's name, a found reference, or the parent.
 */
export type ArtSource = ImageSource | "name" | "reference";
export type ArtCandidates = Partial<Record<ArtSource, string | null>>;
export type ArtPick = { source: ArtSource; url: string };

/** Without a choice: exact-EAN retailer photo, Open Food Facts, a photo by name, a found reference, the parent's photo. */
export const AUTOMATIC_ORDER: readonly ArtSource[] = ["prijsprofeet", "off", "name", "reference", "parent"];

/**
 * The parent's choice wins; when the chosen picture is missing or broken the automatic order fills in, without
 * changing the choice. "photo" is the item's own photo (the parent's, or the Open Food Facts front it replaced).
 */
export function pickArt(choice: PackInfo["imageChoice"], candidates: ArtCandidates): ArtPick | null {
  if (choice === "drawing") return null;
  const preferred: ArtSource[] =
    choice === "photo"
      ? ["parent", "off"]
      : choice === "off"
        ? ["off"]
        : choice === "reference"
          ? ["prijsprofeet", "name", "reference"]
          : [];
  for (const source of [...preferred, ...AUTOMATIC_ORDER]) {
    const url = candidates[source];
    if (url) return { source, url };
  }
  return null;
}

/** Picture URLs that failed to load in this session; every view of the same item skips them alike. */
const broken = new Set<string>();
const brokenListeners = new Set<() => void>();
let brokenVersion = 0;

export function markBroken(url: string) {
  if (broken.has(url)) return;
  broken.add(url);
  brokenVersion += 1;
  for (const listener of brokenListeners) listener();
}

export function useBroken(): (url: string | null | undefined) => string | null {
  useSyncExternalStore(
    (listener) => {
      brokenListeners.add(listener);
      return () => void brokenListeners.delete(listener);
    },
    () => brokenVersion,
  );
  return (url) => (url && !broken.has(url) ? url : null);
}

/** The photo for a typed product: the one the parent picked, else the reliable match from its name lookup. */
export function useNamePhoto(item: Pick<PackInfo, "ean" | "kind" | "namePhoto"> & { name: string }): NamePhoto | null {
  const answer = useNameAnswer(wantsNameImage(item) ? nameImageKey(item.name) : undefined);
  if (!wantsNameImage(item)) return null;
  return item.namePhoto ?? (answer?.classification === "branded" ? answer.match : null);
}

/** What ItemArt shows for an item, and where it came from; also used for the credit line. */
export function useArt(item: ArtItem): { pick: ArtPick | null; drawing: string | null; store: StoreImage | null; name: NamePhoto | null } {
  const usable = useBroken();
  const local = usePhotoUrl(item.imageKind === "photo" ? item.photoId : undefined);
  const own = hasPhoto(item);
  const store = useStoreImage(wantsStoreImage(item) ? item.ean : undefined);
  const named = useNamePhoto(item);
  const identity = identityOf(item);
  const wanted = wantsReference(identity, item.imageChoice, hasOffPhoto(item), Boolean(store || (named && usable(named.imageUrl))));
  const reference = useReferenceUrl(wanted ? identity : null);
  const pick = pickArt(item.imageChoice, {
    off: usable(own && !item.photoId ? item.imageUrl : null),
    prijsprofeet: usable(store?.imageUrl),
    name: usable(named?.imageUrl),
    reference: usable(reference?.url),
    parent: usable(own && item.photoId ? local : null),
  });
  const drawing = usable(usePhotoUrl(item.illustrationId));
  return { pick, drawing, store: pick?.source === "prijsprofeet" ? store : null, name: pick?.source === "name" ? named : null };
}

export function ItemArt({ item, className }: { item: ArtItem; className?: string }) {
  const { pick, drawing } = useArt(item);

  if (pick) {
    return (
      <span className={className ? `product-art item-photo ${className}` : "product-art item-photo"} data-source={pick.source}>
        <img src={pick.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => markBroken(pick.url)} />
      </span>
    );
  }
  if (drawing) {
    return (
      <span className={className ? `product-art item-drawing ${className}` : "product-art item-drawing"}>
        <img src={drawing} alt="" decoding="async" draggable={false} onError={() => markBroken(drawing)} />
      </span>
    );
  }
  return <ProductArt id={item.icon} className={className} />;
}
