import { useState } from "react";
import type { PackInfo } from "../domain/types";
import { usePhotoUrl } from "../storage/photos";
import { ProductArt } from "./ProductArt";

type ArtItem = Pick<PackInfo, "imageUrl" | "imageKind" | "photoId"> & { icon: string; name: string };

export function hasPhoto(item: Pick<PackInfo, "imageUrl" | "imageKind" | "photoId">): boolean {
  return item.imageKind === "photo" && Boolean(item.photoId || item.imageUrl);
}

export function ItemArt({ item, className }: { item: ArtItem; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const local = usePhotoUrl(item.imageKind === "photo" ? item.photoId : undefined);
  const url = !hasPhoto(item) ? undefined : item.photoId ? (local ?? undefined) : item.imageUrl;

  if (url && failed !== url) {
    return (
      <span className={className ? `product-art item-photo ${className}` : "product-art item-photo"}>
        <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setFailed(url)} />
      </span>
    );
  }
  return <ProductArt id={item.icon} className={className} />;
}
