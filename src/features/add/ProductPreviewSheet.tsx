import type { ReactNode } from "react";
import { NutriScoreMark } from "../../components/NutriScoreLogo";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { brandLabel } from "../../domain/customProduct";
import { categoryLabel } from "../../domain/categories";
import { retailerName, type RetailerId } from "../../domain/retailers";
import type { AdventureItem, CategoryId, PackInfo } from "../../domain/types";
import { ProductInfo } from "../review/ProductInfo";
import { OfferTag } from "../offers/OfferTag";

/** Enough pack fields for art, Nutri-Score and facts when the tile has a remembered or listed item. */
export type PreviewPack = Pick<PackInfo, "brand" | "packageSize" | "source" | "recognition" | "nutrition" | "ean"> & {
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
  onClose: () => void;
};

function sparsePack(pack?: PreviewPack) {
  return !pack?.brand && !pack?.nutrition && !pack?.recognition && !pack?.packageSize && !pack?.ean;
}

/** Read-only look at a catalog / Mijn producten tile; editing stays on Controleren. */
export function ProductPreviewSheet({ open, name, category, art, pack, mine, offer, quantity, onAdd, onClose }: ProductPreviewSheetProps) {
  const brand = pack ? brandLabel({ name, brand: pack.brand }) : undefined;
  const detail = [brand, pack?.recognition?.variant, pack?.packageSize].filter(Boolean).join(" · ");
  const factsItem = pack
    ? ({
        id: "preview",
        productId: pack.productId ?? "preview",
        name: pack.name,
        icon: pack.icon ?? "unknown",
        category: pack.category ?? category,
        quantity: 1,
        status: "pending" as const,
        brand: pack.brand,
        packageSize: pack.packageSize,
        source: pack.source,
        recognition: pack.recognition,
        nutrition: pack.nutrition,
        ean: pack.ean,
      } satisfies AdventureItem)
    : null;

  return (
    <Sheet open={open} onClose={onClose} label={`Informatie over ${name}`}>
      <div className="product-preview" data-testid="product-preview">
        <div className="item-sheet-head">
          <div className="item-sheet-art product-preview-art">{art}</div>
          <div className="scan-card-text">
            <h2>{name}</h2>
            {detail && <span>{detail}</span>}
            <NutriScoreMark grade={pack?.nutrition?.nutriscore} />
            <span>{categoryLabel(category)}</span>
            {mine && <small>Uit Mijn producten</small>}
            {pack?.ean && <small>EAN {pack.ean}</small>}
            {offer && <OfferTag shown="deal" retailer={offer} />}
            {quantity > 0 && <small>{quantity} op de lijst</small>}
          </div>
        </div>
        {factsItem && <ProductInfo item={factsItem} />}
        {sparsePack(pack) && (
          <p className="sheet-note">Tik Op de lijst om dit product mee te nemen. Meer details kun je later aanpassen onder Controleren.</p>
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
              onClose();
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
