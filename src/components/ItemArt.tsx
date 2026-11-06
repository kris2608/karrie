import { useState } from "react";
import { identityOf } from "../domain/imageIdentity";
import type { PackInfo } from "../domain/types";
import { usePhotoUrl } from "../storage/photos";
import { useReferenceUrl } from "../storage/references";
import { ProductArt } from "./ProductArt";

type ArtItem = Pick<PackInfo, "imageUrl" | "imageKind" | "photoId" | "imageChoice" | "brand" | "packageSize" | "source" | "recognition"> & { icon: string; name: string };

export function hasPhoto(item: Pick<PackInfo, "imageUrl" | "imageKind" | "photoId">): boolean {
  return item.imageKind === "photo" && Boolean(item.photoId || item.imageUrl);
}

/** The parent's choice first; otherwise a found reference picture beats the submitted photo, which beats the drawing. */
export function pickArt(choice: PackInfo["imageChoice"], reference: string | null, photo: string | null): string | null {
  if (choice === "drawing") return null;
  if (choice === "photo") return photo;
  return reference ?? photo;
}

export function ItemArt({ item, className }: { item: ArtItem; className?: string }) {
  const [failed, setFailed] = useState<string[]>([]);
  const local = usePhotoUrl(item.imageKind === "photo" ? item.photoId : undefined);
  const photo = !hasPhoto(item) ? null : item.photoId ? local : (item.imageUrl ?? null);
  const reference = useReferenceUrl(item.imageChoice === "drawing" || item.imageChoice === "photo" ? null : identityOf(item));
  const usable = (url: string | null | undefined) => (url && !failed.includes(url) ? url : null);
  const url = pickArt(item.imageChoice, usable(reference?.url), usable(photo));

  if (url) {
    return (
      <span className={className ? `product-art item-photo ${className}` : "product-art item-photo"}>
        <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setFailed((list) => [...list, url])} />
      </span>
    );
  }
  return <ProductArt id={item.icon} className={className} />;
}
