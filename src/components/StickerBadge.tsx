import { Karrrie } from "./mascot/Karrrie";
import { ProductArt } from "./ProductArt";
import { StarIcon } from "./ui/StarIcon";

export function StickerBadge({ id }: { id: string }) {
  if (id === "ster") return <StarIcon className="sticker-art" />;
  if (id === "kar") return <Karrrie mood="happy" className="sticker-art" />;
  return <ProductArt id={id} className="sticker-art" />;
}
