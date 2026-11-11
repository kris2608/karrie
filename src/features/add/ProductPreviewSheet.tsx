import { useState, type ReactNode } from "react";
import { useArt } from "../../components/ItemArt";
import { NutriScoreMark } from "../../components/NutriScoreLogo";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { categoryLabel } from "../../domain/categories";
import { productHeading } from "../../domain/productHeading";
import { retailerName, type RetailerId } from "../../domain/retailers";
import type { CategoryId, PackInfo } from "../../domain/types";
import { namePhotoCredit } from "../../services/images/nameImage";
import { storeCredit } from "../../services/images/storeImage";
import { OfferTag } from "../offers/OfferTag";
import { useOffNutrition } from "./useOffNutrition";

/** Enough pack fields for art, Nutri-Score, barcode and facts when the tile has a remembered or listed item. */
export type PreviewPack = Pick<PackInfo, "brand" | "packageSize" | "source" | "recognition" | "nutrition" | "ean" | "barcode" | "offAttribution" | "namePhoto" | "imageChoice" | "imageUrl" | "imageKind" | "photoId" | "imageSource"> & {
  name: string;
  icon?: string;
  productId?: string;
  category?: CategoryId;
};

export type ProductPreviewSheetProps = {
  open: boolean;
  name: string;
  category: CategoryId;
  art: ReactNode;
  pack?: PreviewPack;
  mine?: boolean;
  offer?: RetailerId;
  quantity: number;
  onAdd: () => void;
  /** Accessible quantity decrease without long-press. */
  onDecrease?: () => void;
  /** Explicit forget from Mijn producten (never from long-press). */
  onForgetMine?: () => void;
  onClose: () => void;
};

function sparsePack(pack?: PreviewPack) {
  return !pack?.brand && !pack?.nutrition && !pack?.recognition && !pack?.packageSize && !pack?.ean && !pack?.barcode;
}

function PreviewAttribution({ pack }: { pack: PreviewPack }) {
  const art = useArt({
    name: pack.name,
    icon: pack.icon ?? "unknown",
    ean: pack.ean,
    brand: pack.brand,
    packageSize: pack.packageSize,
    source: pack.source,
    recognition: pack.recognition,
    namePhoto: pack.namePhoto,
    imageChoice: pack.imageChoice,
    imageUrl: pack.imageUrl,
    imageKind: pack.imageKind,
    photoId: pack.photoId,
    imageSource: pack.imageSource,
  });
  const photoCredit =
    art.pick?.source === "prijsprofeet" && art.store
      ? storeCredit(art.store)
      : art.pick?.source === "name" && art.name
        ? namePhotoCredit(art.name)
        : null;
  const offLine = pack.offAttribution
    ? `Gegevens: Open Food Facts (ODbL)${art.pick?.source === "off" ? ", foto's CC BY-SA" : ""}`
    : pack.barcode?.sourceName === "Open Food Facts"
      ? "Gegevens: Open Food Facts (ODbL)"
      : art.pick?.source === "off"
        ? "Foto: Open Food Facts (CC BY-SA)."
        : null;
  const line = [offLine, photoCredit].filter(Boolean).join(" ");
  if (!line) return null;
  return (
    <p className="scan-attribution" data-testid="preview-attribution">
      {line}
    </p>
  );
}

/** Read-only look at a user-added product; editing stays on Controleren. */
export function ProductPreviewSheet({
  open,
  name,
  category,
  art,
  pack,
  mine,
  offer,
  quantity,
  onAdd,
  onDecrease,
  onForgetMine,
  onClose,
}: ProductPreviewSheetProps) {
  const [options, setOptions] = useState(false);
  const [forgetConfirm, setForgetConfirm] = useState(false);
  const heading = productHeading({
    name,
    brand: pack?.brand,
    packageSize: pack?.packageSize,
    variant: pack?.recognition?.variant,
  });
  const nutrition = useOffNutrition(pack?.ean, pack?.nutrition);

  return (
    <Sheet
      open={open}
      onClose={() => {
        setOptions(false);
        setForgetConfirm(false);
        onClose();
      }}
      label={`Informatie over ${heading.title}`}
    >
      <div className="product-preview" data-testid="product-preview">
        <div className="item-sheet-head">
          <div className="item-sheet-art product-preview-art">{art}</div>
          <div className="scan-card-text">
            <h2>{heading.title}</h2>
            {heading.subtitle && <span>{heading.subtitle}</span>}
            <NutriScoreMark grade={nutrition?.nutriscore} />
            <span>{categoryLabel(category)}</span>
            {mine && <small>Uit Mijn producten</small>}
            {offer && <OfferTag shown="deal" retailer={offer} />}
            {quantity > 0 && <small data-testid="preview-qty">{quantity} op de lijst</small>}
          </div>
        </div>

        {pack && <PreviewAttribution pack={pack} />}

        {quantity > 0 && onDecrease && (
          <div className="qty-stepper" data-testid="preview-qty-stepper">
            <button type="button" className="qty-btn" data-testid="preview-qty-minus" aria-label="Eén minder" onClick={onDecrease}>
              −
            </button>
            <span aria-live="polite">{quantity}</span>
            <button
              type="button"
              className="qty-btn"
              data-testid="preview-qty-plus"
              aria-label="Nog één"
              onClick={() => {
                onAdd();
              }}
            >
              +
            </button>
          </div>
        )}

        {sparsePack(pack) && (
          <p className="sheet-note">Tik Op de lijst om dit product mee te nemen. Meer details kun je later aanpassen onder Controleren.</p>
        )}

        {mine && onForgetMine && !options && (
          <button type="button" className="text-button" data-testid="preview-options" onClick={() => setOptions(true)}>
            Aanpassen
          </button>
        )}
        {mine && onForgetMine && options && !forgetConfirm && (
          <div className="preview-options">
            <PressButton variant="quiet" wide className="pbtn-danger" data-testid="preview-forget-mine" onClick={() => setForgetConfirm(true)}>
              Vergeet uit Mijn producten
            </PressButton>
          </div>
        )}
        {mine && onForgetMine && options && forgetConfirm && (
          <div className="preview-options">
            <p className="sheet-note">Dit product verdwijnt uit Mijn producten op dit apparaat.</p>
            <div className="sheet-actions">
              <PressButton variant="quiet" onClick={() => setForgetConfirm(false)}>
                Annuleren
              </PressButton>
              <PressButton variant="primary" data-testid="preview-forget-confirm" onClick={onForgetMine}>
                Vergeten
              </PressButton>
            </div>
          </div>
        )}

        <div className="sheet-actions">
          <PressButton variant="quiet" data-testid="preview-close" onClick={onClose}>
            Sluiten
          </PressButton>
          <PressButton
            variant="primary"
            data-testid="preview-add"
            onClick={() => {
              onAdd();
              if (quantity === 0) onClose();
            }}
          >
            {quantity > 0 ? "Nog één" : "Op de lijst"}
          </PressButton>
        </div>
        {offer && <p className="sheet-note">In de aanbieding bij {retailerName(offer)}.</p>}
      </div>
    </Sheet>
  );
}
