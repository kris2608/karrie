import { useState } from "react";
import { ItemArt } from "../../components/ItemArt";
import { PressButton } from "../../components/ui/PressButton";
import { CATEGORIES, categoryLabel } from "../../domain/categories";
import { categoryIcon } from "../../domain/categoryIcon";
import { draftFromVision, needsCheck, visibleEan } from "../../domain/visionMapping";
import type { AdventureItem, CategoryId, ScannedProduct } from "../../domain/types";
import { lookupProduct } from "../../services/off/lookup";
import type { RecognizedProduct } from "../../services/vision/types";
import { useAdventure } from "../../state/AdventureContext";
import { savePhoto } from "../../storage/photos";

type PhotoResultSheetProps = {
  product: RecognizedProduct | null;
  photoUrl: string;
  photo: Blob;
  target?: AdventureItem;
  items: AdventureItem[];
  onRetake: () => void;
  onCancel: () => void;
  onDone: (message: string) => void;
};

type OffCheck = { state: "idle" } | { state: "loading" } | { state: "found"; product: ScannedProduct } | { state: "missing" };

export function PhotoResultSheet({ product, photoUrl, photo, target, items, onRetake, onCancel, onDone }: PhotoResultSheetProps) {
  const { dispatch } = useAdventure();
  const draft = product ? draftFromVision(product) : null;
  const [name, setName] = useState(draft?.name ?? "");
  const [category, setCategory] = useState<CategoryId>(draft?.category ?? target?.category ?? "pantry");
  const [picking, setPicking] = useState(false);
  const [off, setOff] = useState<OffCheck>({ state: "idle" });
  const [saving, setSaving] = useState(false);
  const ean = product ? visibleEan(product) : null;
  const offProduct = off.state === "found" ? off.product : null;
  const open = items.filter((item) => item.status !== "found" && item.id !== target?.id);
  const candidates = draft?.match ? open.filter((item) => item.productId === draft.match!.id) : [];
  const inferred = new Set(product?.inferredFields ?? []);
  const unsure = product ? needsCheck(product) : false;

  async function commit(run: (photoId: string) => string) {
    if (saving) return;
    setSaving(true);
    try {
      const photoId = await savePhoto(photo);
      onDone(run(photoId));
    } catch {
      setSaving(false);
    }
  }

  /** withInfo: the parent confirmed this item is the recognised product, so its details may be stored too. */
  function attachTo(item: AdventureItem, withInfo: boolean) {
    void commit((photoId) => {
      if (withInfo && offProduct && !item.ean) dispatch({ type: "attach-pack", itemId: item.id, product: offProduct, source: "off" });
      if (withInfo && draft && !offProduct) dispatch({ type: "apply-recognition", itemId: item.id, photoId, pack: draft.pack });
      else dispatch({ type: "set-photo", itemId: item.id, photoId });
      return `Jouw foto staat bij ${item.name}`;
    });
  }

  function addNew() {
    const finalName = name.trim();
    if (!finalName) return;
    const matched = draft?.match && draft.match.category === category ? draft.match : null;
    const icon = matched ? matched.id : categoryIcon(category);
    void commit((photoId) => {
      if (offProduct) {
        dispatch({ type: "add-scanned", product: offProduct, name: finalName, category, icon: offProduct.matchProductId ?? icon, source: "off", photoId });
      } else {
        dispatch({
          type: "add-recognized",
          name: finalName,
          category,
          icon,
          productId: matched?.id,
          photoId,
          pack: draft?.pack,
        });
      }
      return `${finalName} staat op je lijst`;
    });
  }

  async function checkBarcode() {
    if (!ean) return;
    setOff({ state: "loading" });
    const result = await lookupProduct(ean);
    setOff(result.status === "found" ? { state: "found", product: result.product } : { state: "missing" });
  }

  const brandLine = product && [product.brand, product.variant].filter(Boolean).join(" · ");
  const card = (
    <div className="scan-card photo-card" data-testid="photo-card">
      <span className="product-art item-photo scan-card-art">
        <img src={photoUrl} alt="" />
      </span>
      <div className="scan-card-text">
        <strong>{product ? (product.productName ?? product.genericName ?? "Onbekend product") : "Jouw foto"}</strong>
        {brandLine && (
          <span>
            {brandLine} <em className="photo-source">{inferred.has("brand") || inferred.has("variant") ? "geschat" : "gelezen op de verpakking"}</em>
          </span>
        )}
        {product?.packageSize && <span>{product.packageSize}</span>}
        {product?.genericName && <small>{product.genericName}</small>}
      </div>
    </div>
  );

  const barcode = ean && (
    <div className="photo-barcode">
      {off.state === "idle" && (
        <button type="button" className="text-button" data-testid="photo-check-ean" onClick={() => void checkBarcode()}>
          Barcode {ean} gezien. Opzoeken bij Open Food Facts
        </button>
      )}
      {off.state === "loading" && <p className="sheet-note">Barcode opzoeken…</p>}
      {off.state === "missing" && <p className="sheet-note">Open Food Facts kent deze barcode niet. Karrie gebruikt de foto zonder barcode.</p>}
      {offProduct && (
        <p className="sheet-note">
          Open Food Facts: {[offProduct.name, offProduct.brand, offProduct.packageSize].filter(Boolean).join(" · ")}. Klopt dit? Dan bewaart Karrie deze barcode.
        </p>
      )}
    </div>
  );

  const notes = product && (
    <>
      {!product.recognized && <p className="sheet-note">Karrie ziet niet goed welk product dit is. Maak een nieuwe foto van één product, of vul het zelf in.</p>}
      {product.recognized && unsure && <p className="sheet-note">Karrie weet het niet helemaal zeker. Kijk even of het klopt.</p>}
    </>
  );

  const footer = <p className="scan-attribution">{product ? "Herkend met OpenAI. Controleer het altijd even zelf." : "De foto blijft alleen op dit apparaat."}</p>;

  if (target) {
    return (
      <>
        <h2>Deze foto voor {target.name}?</h2>
        {card}
        {notes}
        {barcode}
        <PressButton variant="primary" wide data-testid="photo-attach" disabled={saving} onClick={() => attachTo(target, true)}>
          Gebruik foto voor {target.name}
        </PressButton>
        <div className="sheet-actions scan-actions">
          <PressButton variant="quiet" onClick={onCancel}>
            Annuleren
          </PressButton>
          <PressButton variant="secondary" onClick={onRetake}>
            Opnieuw fotograferen
          </PressButton>
        </div>
        {footer}
      </>
    );
  }

  if (picking) {
    return (
      <>
        <h2>Welke afbeelding wil je vervangen?</h2>
        {card}
        <ul className="scan-pick">
          {open.map((item) => (
            <li key={item.id}>
              <button type="button" disabled={saving} onClick={() => attachTo(item, false)}>
                <ItemArt item={item} />
                <span>{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <PressButton variant="quiet" wide onClick={() => setPicking(false)}>
          Terug
        </PressButton>
      </>
    );
  }

  if (candidates.length > 0 && product?.recognized && product.confidence !== "low") {
    const single = candidates.length === 1 ? candidates[0] : null;
    return (
      <>
        <h2>{single ? `Wil je deze foto gebruiken voor ${single.name}?` : "Bij welk product hoort deze foto?"}</h2>
        {card}
        {notes}
        {single ? (
          <PressButton variant="primary" wide data-testid="photo-use-existing" disabled={saving} onClick={() => attachTo(single, true)}>
            Gebruik foto voor {single.name}
          </PressButton>
        ) : (
          <ul className="scan-pick">
            {candidates.map((item) => (
              <li key={item.id}>
                <button type="button" disabled={saving} onClick={() => attachTo(item, true)}>
                  <ItemArt item={item} />
                  <span>{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="sheet-actions scan-actions">
          <PressButton variant="quiet" onClick={onCancel}>
            Annuleren
          </PressButton>
          <PressButton variant="secondary" data-testid="photo-add-separate" disabled={saving || !name.trim()} onClick={addNew}>
            Als apart product
          </PressButton>
        </div>
        {footer}
      </>
    );
  }

  return (
    <>
      <h2>{!product ? "Wat is het?" : !product.recognized ? "Niet zeker" : unsure ? "Klopt dit?" : "Herkend!"}</h2>
      {card}
      {notes}
      {barcode}
      <label className="scan-field">
        <span>Hoe heet het?</span>
        <input data-testid="photo-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Bijvoorbeeld: pindakaas" autoComplete="off" maxLength={40} />
      </label>
      <fieldset className="scan-field">
        <legend>Waar ligt het in de winkel?</legend>
        <div className="chips">
          {CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === category ? "chip is-active" : "chip"}
              aria-pressed={entry.id === category}
              aria-label={categoryLabel(entry.id)}
              onClick={() => setCategory(entry.id)}
            >
              {entry.short}
            </button>
          ))}
        </div>
      </fieldset>
      <PressButton variant="primary" wide data-testid="photo-add" disabled={saving || !name.trim()} onClick={addNew}>
        Toevoegen aan lijst
      </PressButton>
      {open.length > 0 && (
        <PressButton variant="secondary" wide data-testid="photo-replace" disabled={saving} onClick={() => setPicking(true)}>
          Vervang bestaande afbeelding
        </PressButton>
      )}
      <div className="sheet-actions scan-actions">
        <PressButton variant="quiet" onClick={onCancel}>
          Annuleren
        </PressButton>
        <PressButton variant="secondary" data-testid="photo-retake" onClick={onRetake}>
          Opnieuw fotograferen
        </PressButton>
      </div>
      {footer}
    </>
  );
}
