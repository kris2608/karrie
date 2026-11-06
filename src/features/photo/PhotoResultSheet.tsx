import { useState } from "react";
import { ItemArt } from "../../components/ItemArt";
import { ProductArt } from "../../components/ProductArt";
import { PressButton } from "../../components/ui/PressButton";
import { CATEGORIES, categoryLabel } from "../../domain/categories";
import { categoryIcon } from "../../domain/categoryIcon";
import { declineKey, missionOn } from "../../domain/discovery";
import { draftFromVision, needsCheck } from "../../domain/visionMapping";
import type { AdventureItem, AlternativeAssessment, CategoryId } from "../../domain/types";
import type { RecognizedProduct } from "../../services/vision/types";
import { useAdventure } from "../../state/AdventureContext";
import { savePhoto } from "../../storage/photos";

type PhotoResultSheetProps = {
  product: RecognizedProduct | null;
  photoUrl: string;
  photo: Blob;
  items: AdventureItem[];
  onRetake: () => void;
  onCancel: () => void;
  onDone: (message: string) => void;
};

const MISSION_STATE = {
  on: "Staat aan. Uitzetten kan bij het product.",
  off: "Staat uit. Aanzetten kan bij het product.",
  declined: "Staat uit, want vorige keer kozen jullie deze. Aanzetten kan bij het product.",
};

function MissionNote({ assessment, state }: { assessment?: AlternativeAssessment; state: keyof typeof MISSION_STATE }) {
  if (assessment?.status !== "possible") return null;
  return (
    <div className="photo-mission" data-testid="photo-mission">
      <strong>Bonusmissie: {assessment.alternativeType}</strong>
      {assessment.parentExplanation && <span>{assessment.parentExplanation}</span>}
      <small>{MISSION_STATE[state]}</small>
    </div>
  );
}

export function PhotoResultSheet({ product, photoUrl, photo, items, onRetake, onCancel, onDone }: PhotoResultSheetProps) {
  const { declined, dispatch } = useAdventure();
  const draft = product ? draftFromVision(product) : null;
  const [name, setName] = useState(draft?.name ?? "");
  const [category, setCategory] = useState<CategoryId>(draft?.category ?? "pantry");
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const open = items.filter((item) => item.status !== "found");
  const candidates = draft?.match ? open.filter((item) => item.productId === draft.match!.id) : [];
  const inferred = new Set(product?.inferredFields ?? []);
  const unsure = product ? needsCheck(product) : false;
  const drawing = draft && !draft.keepPhoto ? draft.match : null;
  const assessment = draft?.pack.alternative;
  const keyed = draft ? { name: draft.name, brand: draft.pack.brand, alternative: assessment } : null;
  const missionDefault = Boolean(keyed && missionOn(keyed, declined));
  const missionState = missionDefault ? "on" : keyed && assessment?.evidence === "label" && declined.includes(declineKey(keyed)) ? "declined" : "off";

  async function commit(run: (photoId?: string) => string, withPhoto: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      const photoId = withPhoto ? await savePhoto(photo) : undefined;
      onDone(run(photoId));
    } catch {
      setSaving(false);
    }
  }

  /** withInfo: the parent confirmed this item is the recognised product, so its details may be stored too. */
  function attachTo(item: AdventureItem, withInfo: boolean) {
    void commit((photoId) => {
      if (withInfo && draft) dispatch({ type: "apply-recognition", itemId: item.id, photoId, pack: draft.pack });
      else if (photoId) dispatch({ type: "set-photo", itemId: item.id, photoId });
      return `Jouw foto staat bij ${item.name}`;
    }, true);
  }

  function addOne(item: AdventureItem) {
    dispatch({ type: "set-quantity", itemId: item.id, quantity: item.quantity + 1 });
    onDone(`Nog ${item.name} erbij`);
  }

  function addNew() {
    const finalName = name.trim();
    if (!finalName) return;
    const matched = draft?.match && draft.match.category === category ? draft.match : null;
    const icon = matched ? matched.id : categoryIcon(category);
    const withPhoto = !draft || draft.keepPhoto || !matched;
    void commit((photoId) => {
      dispatch({ type: "add-recognized", name: finalName, category, icon, productId: matched?.id, photoId, pack: draft?.pack });
      return `${finalName} staat op je lijst`;
    }, withPhoto);
  }

  const brandLine = product && [product.brand, product.variant].filter(Boolean).join(" · ");
  const card = (
    <div className="scan-card photo-card" data-testid="photo-card">
      {drawing ? (
        <ProductArt id={drawing.id} className="scan-card-art" />
      ) : (
        <span className="product-art item-photo scan-card-art">
          <img src={photoUrl} alt="" />
        </span>
      )}
      <div className="scan-card-text">
        <strong>{product ? (product.productName ?? product.genericName ?? "Onbekend product") : "Jouw foto"}</strong>
        {brandLine && (
          <span>
            {brandLine} <em className="photo-source">{inferred.has("brand") || inferred.has("variant") ? "geschat" : "gelezen op de verpakking"}</em>
          </span>
        )}
        {product?.packageSize && <span>{product.packageSize}</span>}
        {drawing ? <small data-testid="photo-drawing">Karrie gebruikt de tekening van {drawing.name.toLowerCase()}</small> : product?.genericName && <small>{product.genericName}</small>}
      </div>
    </div>
  );

  const notes = product && (
    <>
      {!product.recognized && <p className="sheet-note">Karrie ziet niet goed welk product dit is. Maak een nieuwe foto van één product, of vul het zelf in.</p>}
      {product.recognized && unsure && <p className="sheet-note">Karrie weet het niet helemaal zeker. Kijk even of het klopt.</p>}
      <MissionNote assessment={assessment} state={missionState} />
    </>
  );

  const footer = <p className="scan-attribution">{product ? "Herkend met OpenAI. Controleer het altijd even zelf." : "De foto blijft alleen op dit apparaat."}</p>;

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

  if (draft && candidates.length > 0 && product?.recognized && product.confidence !== "low") {
    const single = candidates.length === 1 ? candidates[0] : null;
    if (!draft.keepPhoto && single) {
      return (
        <>
          <h2>{single.name} staat al op je lijst</h2>
          {card}
          {notes}
          <PressButton variant="primary" wide data-testid="photo-add-one" onClick={() => addOne(single)}>
            Nog één erbij
          </PressButton>
          <div className="sheet-actions scan-actions">
            <PressButton variant="quiet" onClick={onCancel}>
              Klaar
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
