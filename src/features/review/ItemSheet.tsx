import { useState } from "react";
import { hasPhoto, ItemArt } from "../../components/ItemArt";
import { CameraIcon } from "../../components/ui/PhotoButton";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { StarIcon } from "../../components/ui/StarIcon";
import { CATEGORIES, categoryLabel } from "../../domain/categories";
import { hasSuggestion, missionOn } from "../../domain/discovery";
import type { AdventureItem } from "../../domain/types";
import { productById } from "../../data/catalog";
import { useAdventure } from "../../state/AdventureContext";
import { DrawingPicker } from "./DrawingPicker";
import { PictureBlock } from "./PictureBlock";
import { ProductInfo } from "./ProductInfo";

type ItemSheetProps = {
  item: AdventureItem | null;
  onClose: () => void;
  onRestore: () => void;
  onPhoto: () => void;
  onRemove: () => void;
};

export function ItemSheet({ item, onClose, onRestore, onPhoto, onRemove }: ItemSheetProps) {
  return (
    <Sheet open={Boolean(item)} onClose={onClose} label={item ? `Bewerk ${item.name}` : "Product"}>
      {item && <ItemEditor key={item.id} item={item} onClose={onClose} onRestore={onRestore} onPhoto={onPhoto} onRemove={onRemove} />}
    </Sheet>
  );
}

function MissionBlock({ item }: { item: AdventureItem }) {
  const { settings, declined, dispatch } = useAdventure();
  const assessment = item.alternative;
  if (!assessment || !hasSuggestion(item)) return null;
  const on = missionOn(item, declined);
  const hint = on ? "Je kind krijgt deze missie in de winkel" : assessment.evidence === "label" ? "Uit" : "Uit: niet op het etiket gezien";
  return (
    <section className="mission-block" data-testid="mission-block">
      <header>
        <StarIcon />
        <strong>Bonusmissie: {assessment.alternativeType}</strong>
      </header>
      {assessment.parentExplanation && <p>{assessment.parentExplanation}</p>}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={on ? "switch-row is-on" : "switch-row"}
        data-testid="mission-switch"
        onClick={() => dispatch({ type: "set-mission", itemId: item.id, enabled: !on })}
      >
        <span className="switch-label">
          <strong>Bonusmissie {on ? "aan" : "uit"}</strong>
          <small>{hint}</small>
        </span>
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
      </button>
      {!settings.smartDiscovery && <small>Bonusmissies staan uit voor de hele app.</small>}
      <small>Een suggestie van OpenAI. Kijk altijd zelf even op het etiket.</small>
    </section>
  );
}

function ItemEditor({ item, onClose, onRestore, onPhoto, onRemove }: ItemSheetProps & { item: AdventureItem }) {
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
      {item.offAttribution && <p className="scan-attribution">Gegevens: Open Food Facts (ODbL){item.imageSource === "off" ? ", foto's CC BY-SA" : ""}</p>}
      <PictureBlock item={item} />
      <ProductInfo item={item} />
      <MissionBlock item={item} />

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
        {hasPhoto(item) && (
          <PressButton variant="quiet" wide data-testid="restore-generic" onClick={onRestore}>
            Gebruik Karrie-tekening
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
