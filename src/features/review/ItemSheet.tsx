import { useState } from "react";
import { hasPhoto, ItemArt } from "../../components/ItemArt";
import { PressButton } from "../../components/ui/PressButton";
import { BarcodeIcon, CameraIcon } from "../../components/ui/ScanButton";
import { Sheet } from "../../components/ui/Sheet";
import { CATEGORIES, categoryLabel } from "../../domain/categories";
import type { AdventureItem } from "../../domain/types";
import { productById } from "../../data/catalog";
import { useAdventure } from "../../state/AdventureContext";
import { DrawingPicker } from "../scanner/ScanResultSheet";

type ItemSheetProps = {
  item: AdventureItem | null;
  onClose: () => void;
  onRestore: () => void;
  onScan: () => void;
  onPhoto: () => void;
  onRemove: () => void;
};

export function ItemSheet({ item, onClose, onRestore, onScan, onPhoto, onRemove }: ItemSheetProps) {
  return (
    <Sheet open={Boolean(item)} onClose={onClose} label={item ? `Bewerk ${item.name}` : "Product"}>
      {item && <ItemEditor key={item.id} item={item} onClose={onClose} onRestore={onRestore} onScan={onScan} onPhoto={onPhoto} onRemove={onRemove} />}
    </Sheet>
  );
}

function ItemEditor({ item, onClose, onRestore, onScan, onPhoto, onRemove }: ItemSheetProps & { item: AdventureItem }) {
  const { dispatch } = useAdventure();
  const [name, setName] = useState(item.name);
  const [editing, setEditing] = useState(false);
  const parentPhoto = item.imageSource === "parent" && Boolean(item.photoId);
  const variant = item.recognition?.variant;
  const detail = [item.brand, variant, item.packageSize].filter(Boolean).join(" · ");

  function saveName() {
    const next = name.trim();
    if (next && next !== item.name) dispatch({ type: "edit-item", itemId: item.id, name: next });
    else setName(item.name);
  }

  function done() {
    saveName();
    onClose();
  }

  return (
    <>
      <div className="item-sheet-head">
        <ItemArt item={item} className="item-sheet-art" />
        <div className="scan-card-text">
          <h2>{item.name}</h2>
          {detail && <span>{detail}</span>}
          <span>{categoryLabel(item.category)}</span>
          {item.ean && <small>EAN {item.ean}</small>}
          {item.source === "vision" && <small>Herkend van een foto</small>}
        </div>
      </div>
      {item.offAttribution && <p className="scan-attribution">Gegevens: Open Food Facts (ODbL){parentPhoto ? "" : ", foto's CC BY-SA"}</p>}

      {editing ? (
        <div className="item-edit" data-testid="item-edit">
          <label className="scan-field">
            <span>Naam</span>
            <input
              data-testid="item-name"
              value={name}
              maxLength={40}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
              onBlur={saveName}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            />
          </label>
          <fieldset className="scan-field">
            <legend>Afdeling</legend>
            <div className="chips">
              {CATEGORIES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={entry.id === item.category ? "chip is-active" : "chip"}
                  aria-pressed={entry.id === item.category}
                  onClick={() => dispatch({ type: "edit-item", itemId: item.id, category: entry.id })}
                >
                  {entry.short}
                </button>
              ))}
            </div>
          </fieldset>
          <DrawingPicker
            name={name}
            category={item.category}
            icon={item.icon}
            onPick={(id) => dispatch({ type: "edit-item", itemId: item.id, icon: id, productId: productById(id) ? id : undefined })}
          />
        </div>
      ) : (
        <button type="button" className="text-button" data-testid="item-edit-open" onClick={() => setEditing(true)}>
          Naam, afdeling of tekening aanpassen
        </button>
      )}

      <div className="item-sheet-actions">
        <PressButton variant="secondary" wide data-testid="photo-pack" onClick={onPhoto}>
          <CameraIcon />
          {parentPhoto ? "Nieuwe foto" : "Maak foto"}
        </PressButton>
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
      <PressButton variant="primary" wide onClick={done}>
        Klaar
      </PressButton>
    </>
  );
}
