import { useState } from "react";
import type { PackInfo } from "../domain/types";
import { ProductArt } from "./ProductArt";

type ArtItem = Pick<PackInfo, "imageUrl" | "imageKind"> & { icon: string; name: string };

export function hasPhoto(item: Pick<PackInfo, "imageUrl" | "imageKind">): boolean {
  return item.imageKind === "photo" && Boolean(item.imageUrl);
}

export function ItemArt({ item, className }: { item: ArtItem; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = hasPhoto(item) ? item.imageUrl : undefined;

  if (url && failed !== url) {
    return (
      <span className={className ? `product-art item-photo ${className}` : "product-art item-photo"}>
        <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setFailed(url)} />
      </span>
    );
  }
  return <ProductArt id={item.icon} className={className} />;
}
