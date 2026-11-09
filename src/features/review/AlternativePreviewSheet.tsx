import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { retailerName, type RetailerId } from "../../domain/retailers";
import { namePhotoCredit } from "../../services/images/nameImage";
import type { NamePhoto } from "../../domain/types";

export type AlternativePreviewSheetProps = {
  open: boolean;
  photo: NamePhoto | null;
  retailer: RetailerId | undefined;
  onClose: () => void;
  onConfirm: (photo: NamePhoto) => void;
};

/** Compact preview before adopting a private-label alternative; closing never mutates the item. */
export function AlternativePreviewSheet({ open, photo, retailer, onClose, onConfirm }: AlternativePreviewSheetProps) {
  return (
    <Sheet open={open && Boolean(photo)} onClose={onClose} label="Alternatief bekijken">
      {photo && (
        <div className="alt-preview" data-testid="alternative-preview">
          <div className="item-sheet-head">
            <img
              className="item-sheet-art alt-preview-art"
              src={photo.imageUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              draggable={false}
            />
            <div className="scan-card-text">
              <h2>{photo.productName}</h2>
              {(photo.brand || photo.packaging || retailer) && (
                <span>{[photo.brand, photo.packaging, retailer ? retailerName(retailer) : null].filter(Boolean).join(" · ")}</span>
              )}
            </div>
          </div>
          <small className="picture-source">{namePhotoCredit(photo)}</small>
          <div className="sheet-actions">
            <PressButton type="button" variant="quiet" data-testid="alternative-keep" onClick={onClose}>
              Behouden
            </PressButton>
            <PressButton type="button" variant="primary" data-testid="alternative-use" onClick={() => onConfirm(photo)}>
              Gebruik dit product
            </PressButton>
          </div>
        </div>
      )}
    </Sheet>
  );
}
