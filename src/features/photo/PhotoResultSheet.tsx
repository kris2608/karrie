import { useEffect, useRef, useState } from "react";
import { ItemArt, markBroken, useBroken } from "../../components/ItemArt";
import { ProductArt } from "../../components/ProductArt";
import { PressButton } from "../../components/ui/PressButton";
import { CATEGORIES, categoryLabel } from "../../domain/categories";
import { categoryIcon } from "../../domain/categoryIcon";
import { declineKey, missionOn } from "../../domain/discovery";
import { newItemFor, type DraftField, type ProductDraft } from "../../domain/productDraft";
import type { AdventureItem, AlternativeAssessment, CategoryId } from "../../domain/types";
import { useAdventure } from "../../state/AdventureContext";
import { savePhoto, usePhotoUrl } from "../../storage/photos";
import { storeCredit } from "../../services/images/storeImage";
import { storeImages, useStoreImage } from "../../storage/storeImages";

type PhotoResultSheetProps = {
  /** Null: nothing usable was found and the parent fills it in. */
  draft: ProductDraft | null;
  /** The new photo, if the parent took one; a barcode alone needs none. */
  photoUrl?: string;
  photo?: Blob;
  items: AdventureItem[];
  onRetake: () => void;
  onCancel: () => void;
  /** scan: straight back to the camera for the next product; done: close the camera. */
  onDone: (message: string, after: "scan" | "done") => void;
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

export function sourceLabel(field: DraftField | undefined, draft: ProductDraft): string | null {
  if (!field) return null;
  if (field.source === "parent") return "uit Mijn producten";
  if (field.source === "off") return "Open Food Facts";
  if (field.source === "web") return `gevonden op ${draft.from.barcode?.source.name ?? "internet"}`;
  if (field.source === "photo") return "gelezen op de verpakking";
  return "geschat";
}

/** Each source says what it is and under which licence; Open Food Facts data and its photos are listed apart. */
export function sourcesLine(draft: ProductDraft | null, hasPhoto: boolean): string {
  if (!draft) return "De foto blijft alleen op dit apparaat.";
  const parts: string[] = [];
  const barcode = draft.from.barcode;
  if (barcode?.source.kind === "off") parts.push(`Gegevens: Open Food Facts (ODbL)${draft.imageUrl && !hasPhoto ? ", foto CC BY-SA" : ""}.`);
  if (barcode?.source.kind === "web") parts.push(`Gevonden op ${barcode.source.name} via de streepjescode.`);
  if (draft.from.photo) parts.push("Herkend met OpenAI.");
  if (draft.from.mine && !barcode && !draft.from.photo) return "Uit Mijn producten.";
  parts.push("Controleer het altijd even zelf.");
  return parts.join(" ");
}

export function PhotoResultSheet({ draft, photoUrl, photo, items, onRetake, onCancel, onDone }: PhotoResultSheetProps) {
  const { declined, dispatch } = useAdventure();
  const [name, setName] = useState(draft?.name ?? "");
  const [category, setCategory] = useState<CategoryId>(draft?.category ?? "pantry");
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Set in the same tap, so a quick second tap (even on the sheet as it slides away) does nothing. */
  const settled = useRef(false);
  const earlier = usePhotoUrl(photoUrl ? undefined : draft?.photoId);
  const open = items.filter((item) => item.status !== "found");
  const candidates = draft?.match ? open.filter((item) => item.productId === draft.match!.id) : [];
  const drawing = draft && !draft.keepPhoto ? draft.match : null;
  const assessment = draft?.pack.alternative;
  const keyed = draft ? { name: draft.name, brand: draft.pack.brand, alternative: assessment } : null;
  const missionDefault = Boolean(keyed && missionOn(keyed, declined));
  const missionState = missionDefault ? "on" : keyed && assessment?.evidence === "label" && declined.includes(declineKey(keyed)) ? "declined" : "off";
  const lookStore = Boolean(draft?.ean && !draft.imageUrl);
  useEffect(() => {
    if (lookStore) storeImages.request(draft?.ean);
  }, [lookStore, draft?.ean]);
  const store = useStoreImage(lookStore ? draft?.ean : undefined);
  const usable = useBroken();
  const picture = photoUrl ?? earlier ?? usable(draft?.imageUrl) ?? usable(store?.imageUrl);
  const storeShown = Boolean(store && picture === store.imageUrl);

  /** The new photo is stored when asked for; without one, the parent's earlier photo stays with the product. */
  async function commit(run: (photoId?: string) => string, withPhoto: boolean, after: "scan" | "done" = "scan") {
    if (settled.current) return;
    settled.current = true;
    setSaving(true);
    try {
      const photoId = withPhoto && photo ? await savePhoto(photo) : photo ? undefined : draft?.photoId;
      onDone(run(photoId), after);
    } catch {
      settled.current = false;
      setSaving(false);
    }
  }

  /** withInfo: the parent confirmed this item is the recognised product, so its details may be stored too. */
  function attachTo(item: AdventureItem, withInfo: boolean) {
    void commit((photoId) => {
      if (withInfo && draft) dispatch({ type: "apply-recognition", itemId: item.id, photoId, pack: draft.pack });
      else if (photoId) dispatch({ type: "set-photo", itemId: item.id, photoId });
      return photo ? `Jouw foto staat bij ${item.name}` : `${item.name} is bijgewerkt`;
    }, true);
  }

  function addOne(item: AdventureItem) {
    void commit(() => {
      dispatch({ type: "set-quantity", itemId: item.id, quantity: item.quantity + 1 });
      return `Nog ${item.name} erbij`;
    }, false);
  }

  function addNew(after: "scan" | "done" = "scan") {
    const finalName = name.trim();
    if (!finalName) return;
    const { item, withPhoto } = newItemFor(draft, finalName, category);
    void commit(
      (photoId) => {
        dispatch({ type: "add-recognized", ...item, photoId });
        return `${finalName} staat op je lijst`;
      },
      withPhoto,
      after,
    );
  }

  const brandField = draft?.fields.brand ?? draft?.fields.variant;
  const brandLine = draft && [draft.fields.brand?.value, draft.fields.variant?.value].filter(Boolean).join(" · ");
  const card = (
    <div className="scan-card photo-card" data-testid="photo-card">
      {drawing ? (
        <ProductArt id={drawing.id} className="scan-card-art" />
      ) : picture ? (
        <span className="product-art item-photo scan-card-art">
          <img src={picture} alt="" referrerPolicy="no-referrer" onError={() => markBroken(picture)} />
        </span>
      ) : (
        <ProductArt id={draft?.icon ?? categoryIcon(category)} className="scan-card-art" />
      )}
      <div className="scan-card-text">
        <strong>{draft ? draft.name || "Onbekend product" : "Jouw foto"}</strong>
        {brandLine && draft && (
          <span>
            {brandLine} <em className="photo-source">{sourceLabel(brandField, draft)}</em>
          </span>
        )}
        {draft?.fields.packageSize && <span>{draft.fields.packageSize.value}</span>}
        {drawing ? (
          <small data-testid="photo-drawing">Karrie gebruikt de tekening van {drawing.name.toLowerCase()}</small>
        ) : (
          draft?.from.photo?.genericName && <small>{draft.from.photo.genericName}</small>
        )}
        {draft?.ean && (
          <small className="photo-ean" data-testid="photo-ean">
            Streepjescode {draft.ean}
          </small>
        )}
      </div>
    </div>
  );

  const notes = draft && (
    <>
      {!draft.recognized && draft.from.photo && <p className="sheet-note">Karrie ziet niet goed welk product dit is. Maak een nieuwe foto van één product, of vul het zelf in.</p>}
      {draft.recognized && draft.unsure && <p className="sheet-note">Karrie weet het niet helemaal zeker. Kijk even of het klopt.</p>}
      <MissionNote assessment={assessment} state={missionState} />
    </>
  );

  const footer = (
    <p className="scan-attribution">
      {sourcesLine(draft, Boolean(photoUrl))}
      {storeShown && store && <> {storeCredit(store)}</>}
    </p>
  );
  const retakeLabel = photo ? "Opnieuw fotograferen" : "Terug naar camera";

  if (picking && photo) {
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

  if (draft && candidates.length > 0 && draft.recognized && draft.confident) {
    const single = candidates.length === 1 ? candidates[0] : null;
    if (!draft.keepPhoto && single) {
      return (
        <>
          <h2>{single.name} staat al op je lijst</h2>
          {card}
          {notes}
          <PressButton variant="primary" wide data-testid="photo-add-one" disabled={saving} onClick={() => addOne(single)}>
            Nog één erbij
          </PressButton>
          <div className="sheet-actions scan-actions">
            <PressButton variant="quiet" onClick={onCancel}>
              Klaar
            </PressButton>
            <PressButton variant="secondary" data-testid="photo-add-separate" disabled={saving || !name.trim()} onClick={() => addNew()}>
              Als apart product
            </PressButton>
          </div>
          {footer}
        </>
      );
    }
    const question = single ? (photo ? `Wil je deze foto gebruiken voor ${single.name}?` : `Is dit de ${single.name.toLowerCase()} van je lijst?`) : `Bij welk product hoort ${photo ? "deze foto" : "dit"}?`;
    return (
      <>
        <h2>{question}</h2>
        {card}
        {notes}
        {single ? (
          <PressButton variant="primary" wide data-testid="photo-use-existing" disabled={saving} onClick={() => attachTo(single, true)}>
            {photo ? `Gebruik foto voor ${single.name}` : `Ja, werk ${single.name} bij`}
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
          <PressButton variant="secondary" data-testid="photo-add-separate" disabled={saving || !name.trim()} onClick={() => addNew()}>
            Als apart product
          </PressButton>
        </div>
        {footer}
      </>
    );
  }

  const heading = !draft || (!draft.recognized && !draft.from.photo) ? "Wat is het?" : !draft.recognized ? "Niet zeker" : draft.unsure ? "Klopt dit?" : "Herkend!";
  return (
    <>
      <h2>{heading}</h2>
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
      <PressButton variant="primary" wide data-testid="photo-add" disabled={saving || !name.trim()} onClick={() => addNew("scan")}>
        Toevoegen en verder scannen
      </PressButton>
      <PressButton variant="quiet" wide data-testid="photo-add-done" disabled={saving || !name.trim()} onClick={() => addNew("done")}>
        Toevoegen en klaar
      </PressButton>
      {open.length > 0 && photo && (
        <button type="button" className="text-button photo-replace" data-testid="photo-replace" disabled={saving} onClick={() => setPicking(true)}>
          Vervang bestaande afbeelding
        </button>
      )}
      <div className="sheet-actions scan-actions">
        <PressButton variant="quiet" onClick={onCancel}>
          Annuleren
        </PressButton>
        <PressButton variant="quiet" data-testid="photo-retake" onClick={onRetake}>
          {retakeLabel}
        </PressButton>
      </div>
      {footer}
    </>
  );
}
