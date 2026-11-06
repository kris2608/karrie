import { hasPhoto, ItemArt } from "../../components/ItemArt";
import { PressButton } from "../../components/ui/PressButton";
import { BarcodeIcon } from "../../components/ui/ScanButton";
import { Sheet } from "../../components/ui/Sheet";
import { categoryLabel } from "../../domain/categories";
import type { AdventureItem } from "../../domain/types";

type ItemSheetProps = {
  item: AdventureItem | null;
  onClose: () => void;
  onRestore: () => void;
  onScan: () => void;
  onRemove: () => void;
};

export function ItemSheet({ item, onClose, onRestore, onScan, onRemove }: ItemSheetProps) {
  return (
    <Sheet open={Boolean(item)} onClose={onClose} label={item ? `Bewerk ${item.name}` : "Product"}>
      {item && (
        <>
          <div className="item-sheet-head">
            <ItemArt item={item} className="item-sheet-art" />
            <div className="scan-card-text">
              <h2>{item.name}</h2>
              {(item.brand || item.packageSize) && <span>{[item.brand, item.packageSize].filter(Boolean).join(" · ")}</span>}
              <span>{categoryLabel(item.category)}</span>
              {item.ean && <small>EAN {item.ean}</small>}
            </div>
          </div>
          {item.offAttribution && <p className="scan-attribution">Gegevens: Open Food Facts (ODbL), foto's CC BY-SA</p>}
          <div className="item-sheet-actions">
            <PressButton variant="secondary" wide data-testid="scan-pack" onClick={onScan}>
              <BarcodeIcon />
              {item.ean ? "Scan andere verpakking" : "Scan verpakking"}
            </PressButton>
            {(hasPhoto(item) || item.ean) && (
              <PressButton variant="quiet" wide data-testid="restore-generic" onClick={onRestore}>
                {hasPhoto(item) ? "Gebruik Karrie-tekening" : "Barcode loskoppelen"}
              </PressButton>
            )}
            <PressButton variant="quiet" wide className="pbtn-danger" data-testid="remove-item" onClick={onRemove}>
              Verwijder van lijst
            </PressButton>
          </div>
          <PressButton variant="primary" wide onClick={onClose}>
            Klaar
          </PressButton>
        </>
      )}
    </Sheet>
  );
}
