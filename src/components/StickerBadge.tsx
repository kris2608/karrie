import { Karrie } from "./mascot/Karrie";
import { ProductArt } from "./ProductArt";
import { StarIcon } from "./ui/StarIcon";

export function StickerBadge({ id }: { id: string }) {
  if (id === "ster") return <StarIcon className="sticker-art" />;
  if (id === "kar") return <Karrie mood="happy" className="sticker-art" />;
  return <ProductArt id={id} className="sticker-art" />;
}
