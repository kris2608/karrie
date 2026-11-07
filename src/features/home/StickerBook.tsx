import { StickerBadge } from "../../components/StickerBadge";
import { PressButton } from "../../components/ui/PressButton";
import { stickerLabel } from "../../domain/stickers";

/** Every earned sticker, big and with its name; only earned ones, so the book never looks unfinished. */
export function StickerBook({ stickers, onClose }: { stickers: string[]; onClose: () => void }) {
  return (
    <>
      <h2>Mijn stickers</h2>
      <p className="sheet-note">
        {stickers.length} {stickers.length === 1 ? "sticker" : "stickers"} verzameld
      </p>
      <ul className="sticker-book" data-testid="sticker-book">
        {stickers.map((id) => (
          <li key={id}>
            <span className="sticker-slot sticker-big">
              <StickerBadge id={id} />
            </span>
            <span>{stickerLabel(id)}</span>
          </li>
        ))}
      </ul>
      <PressButton variant="secondary" wide onClick={onClose}>
        Klaar
      </PressButton>
    </>
  );
}
