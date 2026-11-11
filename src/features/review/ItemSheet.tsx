import { useEffect, useState } from "react";
import { hasPhoto, ItemArt, useArt } from "../../components/ItemArt";
import { NutriScoreMark } from "../../components/NutriScoreLogo";
import { CameraIcon } from "../../components/ui/PhotoButton";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { StarIcon } from "../../components/ui/StarIcon";
import { CATEGORIES, categoryLabel } from "../../domain/categories";
import { hasSuggestion, missionOn } from "../../domain/discovery";
import { privateLabelLookupKey, privateLabelQuery, wantsPrivateLabels } from "../../domain/imageIdentity";
import { productHeading } from "../../domain/productHeading";
import { retailerName } from "../../domain/retailers";
import type { AdventureItem, NamePhoto } from "../../domain/types";
import { productById } from "../../data/catalog";
import { confirmPackSize } from "../../services/barcode/pack";
import { useAdventure } from "../../state/AdventureContext";
import { privateLabelImages, usePrivateLabelAnswer } from "../../storage/nameImages";
import { PackConflict } from "../photo/PackConflict";
import { useOffNutrition } from "../add/useOffNutrition";
import { AlternativePreviewSheet } from "./AlternativePreviewSheet";
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
  const { dispatch, adventure } = useAdventure();
  const [name, setName] = useState(item.name);
  const [editing, setEditing] = useState(false);
  const [moreInfo, setMoreInfo] = useState(false);
  const [preview, setPreview] = useState<NamePhoto | null>(null);
  const parentPhoto = item.imageSource === "parent" && Boolean(item.photoId);
  const shown = useArt(item).pick;
  const heading = productHeading({
    name: item.name,
    brand: item.brand,
    packageSize: item.packageSize,
    variant: item.recognition?.variant,
  });
  const listRetailer = adventure?.retailer;
  const crossRetailer =
    item.privateLabelRetailer && listRetailer && item.privateLabelRetailer !== listRetailer ? item.privateLabelRetailer : undefined;
  const plQuery = crossRetailer && listRetailer && wantsPrivateLabels(item, listRetailer) ? privateLabelQuery(item) : null;
  const plKey = plQuery && listRetailer ? privateLabelLookupKey(plQuery, listRetailer) : undefined;
  const altAnswer = usePrivateLabelAnswer(plKey);
  const jumboAlt = altAnswer?.privateLabelAlternatives?.[0] ?? null;
  const nutrition = useOffNutrition(item.ean, item.nutrition);

  useEffect(() => {
    if (plKey) privateLabelImages.request(plKey);
  }, [plKey]);

  function saveName() {
    const next = name.trim();
    if (next && next !== item.name) dispatch({ type: "edit-item", itemId: item.id, name: next });
    else setName(item.name);
  }

  function done() {
    saveName();
    onClose();
  }

  function adopt(photo: NamePhoto) {
    if (!listRetailer) return;
    dispatch({
      type: "adopt-commercial",
      itemId: item.id,
      name: photo.productName.slice(0, 40),
      ...(photo.brand && { brand: photo.brand.slice(0, 40) }),
      privateLabelRetailer: listRetailer,
      photo,
    });
    setPreview(null);
  }

  return (
    <>
      <div className="item-sheet-head">
        <ItemArt item={item} className="item-sheet-art" />
        <div className="scan-card-text">
          <h2>{heading.title}</h2>
          {heading.subtitle && <span>{heading.subtitle}</span>}
          <NutriScoreMark grade={nutrition?.nutriscore} />
          <span>{categoryLabel(item.category)}</span>
        </div>
      </div>
      {item.offAttribution && (
        <p className="scan-attribution">
          Gegevens: Open Food Facts (ODbL)
          {shown?.source === "off" ? ", foto's CC BY-SA" : ""}
        </p>
      )}
      {item.packConflict && item.fieldSources?.packageSize !== "parent" && (
        <PackConflict
          choices={item.packConflict.choices}
          raw={item.packConflict.raw}
          onConfirm={(quantity) => {
            dispatch({ type: "confirm-pack-size", itemId: item.id, packageSize: quantity });
            if (item.ean) void confirmPackSize(item.ean, quantity);
          }}
        />
      )}
      {crossRetailer && listRetailer && (
        <p className="sheet-note" data-testid="cross-retailer-note">
          Dit is een {retailerName(crossRetailer)}-product. Je hebt nu {retailerName(listRetailer)} geselecteerd.
          {jumboAlt && (
            <>
              {" "}
              <button type="button" className="text-button" data-testid="view-retailer-alternative" onClick={() => setPreview(jumboAlt)}>
                Bekijk {retailerName(listRetailer)}-alternatief
              </button>
            </>
          )}
        </p>
      )}

      <MissionBlock item={item} />

      <button type="button" className="text-button" data-testid="item-more-info" onClick={() => setMoreInfo((value) => !value)}>
        {moreInfo ? "Minder informatie" : "Meer informatie"}
      </button>
      {moreInfo && <ProductInfo item={item} hideNutriScore />}

      <button type="button" className="text-button" data-testid="item-edit-open" onClick={() => setEditing((value) => !value)}>
        {editing ? "Minder opties" : "Aanpassen"}
      </button>

      {editing && (
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
          {!item.ean && (
            <DrawingPicker
              name={name}
              category={item.category}
              icon={item.icon}
              onPick={(id) => dispatch({ type: "edit-item", itemId: item.id, icon: id, productId: productById(id) ? id : undefined })}
            />
          )}
          <PictureBlock item={item} />
          <div className="item-sheet-actions">
            {!item.ean && (
              <PressButton variant="secondary" wide data-testid="photo-pack" onClick={onPhoto}>
                <CameraIcon />
                {parentPhoto ? "Nieuwe foto" : "Maak foto"}
              </PressButton>
            )}
            {!item.ean && hasPhoto(item) && (
              <PressButton variant="quiet" wide data-testid="restore-generic" onClick={onRestore}>
                Gebruik Karrie-tekening
              </PressButton>
            )}
            <PressButton variant="quiet" wide className="pbtn-danger" data-testid="remove-item" onClick={onRemove}>
              Verwijder van lijst
            </PressButton>
          </div>
        </div>
      )}

      <PressButton variant="primary" wide onClick={done}>
        Klaar
      </PressButton>

      <AlternativePreviewSheet open={Boolean(preview)} photo={preview} retailer={listRetailer} onClose={() => setPreview(null)} onConfirm={adopt} />
    </>
  );
}
