import { useEffect } from "react";
import { markBroken, useArt, useNamePhoto } from "../../components/ItemArt";
import { hasOffPhoto, identityKey, identityOf, nameImageLookupKey, wantsNameImage, wantsReference, wantsStoreImage } from "../../domain/imageIdentity";
import { namePhotoCredit } from "../../services/images/nameImage";
import { storeCredit } from "../../services/images/storeImage";
import { nameImages, useNameAnswer } from "../../storage/nameImages";
import { useStoreImage } from "../../storage/storeImages";
import type { AdventureItem, ImageChoice, NamePhoto } from "../../domain/types";
import { useAdventure } from "../../state/AdventureContext";
import { references, shownImage, useReference, useSearching } from "../../storage/references";

const STATUS: Record<string, string> = {
  searching: "Karrie zoekt een voorbeeldfoto…",
  review: "Karrie twijfelt over deze foto's. Tik op een foto om hem te gebruiken.",
  none: "Geen passende voorbeeldfoto gevonden.",
  error: "Zoeken lukte niet. Karrie probeert het later opnieuw.",
  limit: "Even te veel zoekopdrachten. Karrie probeert het later opnieuw.",
  removed: "Geen voorbeeldfoto voor dit product.",
};

/** Parent-only picture controls: which picture the child sees, and where a reference picture came from. */
export function PictureBlock({ item }: { item: AdventureItem }) {
  const { settings, dispatch, adventure } = useAdventure();
  const identity = identityOf(item);
  const offPhoto = hasOffPhoto(item);
  const store = useStoreImage(wantsStoreImage(item) ? item.ean : undefined);
  const { pick: art, name: namePhoto } = useArt(item);
  const named = useNamePhoto(item);
  const nameKey = wantsNameImage(item) ? nameImageLookupKey(item.name, adventure?.retailer) : undefined;
  const answer = useNameAnswer(nameKey);
  const others = answer?.classification === "branded" ? [answer.match, ...answer.alternatives].filter((photo): photo is NamePhoto => Boolean(photo)) : [];
  const privateLabels = answer?.privateLabelAlternatives ?? [];
  const wanted = wantsReference(identity, item.imageChoice, offPhoto, Boolean(store || named));
  const entry = useReference(identity);
  const shown = wanted ? shownImage(entry) : null;
  const searching = useSearching(identity);
  const key = identity ? identityKey(identity) : null;

  useEffect(() => {
    if (settings.referenceImages && wanted) references.request(identity);
  }, [key, wanted, settings.referenceImages]);
  useEffect(() => {
    if (nameKey) nameImages.request(nameKey);
  }, [nameKey]);
  const candidates = wanted ? (entry?.discovery?.candidates ?? []) : [];
  const active: ImageChoice =
    item.imageChoice ??
    (art?.source === "prijsprofeet" || art?.source === "name" || art?.source === "reference"
      ? "reference"
      : art?.source === "off"
        ? "off"
        : art?.source === "parent"
          ? "photo"
          : "drawing");
  const status = !wanted ? null : searching ? "searching" : entry?.chosen === null ? "removed" : shown ? null : entry?.state;
  /** A standard product, or a pack with an Open Food Facts photo, only searches when the parent asks for a picture. */
  const optIn = Boolean((identity?.generic || offPhoto) && settings.referenceImages && !store);

  const choose = (choice: ImageChoice | undefined) => dispatch({ type: "set-image-choice", itemId: item.id, choice });
  const pick = (choice: ImageChoice) => {
    if (choice === "reference" && identity && entry?.chosen === null) references.choose(identity, undefined);
    choose(choice);
  };
  const choices: { id: ImageChoice; label: string; show: boolean }[] = [
    { id: "reference", label: store ? "Winkelfoto" : "Voorbeeldfoto", show: Boolean(shown || store || named) || optIn },
    { id: "off", label: "Open Food Facts-foto", show: offPhoto },
    { id: "photo", label: "Eigen foto", show: Boolean(item.photoId) },
    { id: "drawing", label: "Tekening", show: true },
  ];

  if (!identity || (!settings.referenceImages && !entry && !store && !named && !others.length && !privateLabels.length)) return null;
  const chosenName = named?.imageUrl;

  return (
    <section className="picture-block" data-testid="picture-block">
      <fieldset className="scan-field">
        <legend>Je kind ziet</legend>
        <div className="chips">
          {choices
            .filter((choice) => choice.show)
            .map((choice) => (
              <button
                key={choice.id}
                type="button"
                className={choice.id === active ? "chip is-active" : "chip"}
                aria-pressed={choice.id === active}
                data-testid={`picture-${choice.id}`}
                onClick={() => pick(choice.id)}
              >
                {choice.label}
              </button>
            ))}
        </div>
      </fieldset>

      {status && STATUS[status] && <small data-testid="picture-status">{STATUS[status]}</small>}

      {candidates.length > 0 && (
        <div className="picture-candidates" role="group" aria-label="Gevonden foto's">
          {candidates.map((candidate, index) => (
            <button
              key={candidate.imageUrl}
              type="button"
              className={candidate === shown ? "picture-candidate is-active" : "picture-candidate"}
              aria-pressed={candidate === shown}
              aria-label={`Foto van ${candidate.sourceName}`}
              data-testid="picture-candidate"
              onClick={() => {
                references.choose(identity, index);
                choose("reference");
              }}
            >
              <img src={candidate.thumbnailUrl ?? candidate.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} />
            </button>
          ))}
        </div>
      )}

      {(others.length > 1 || privateLabels.length > 0) && (
        <div className="picture-variants" data-testid="picture-variants">
          <p className="sheet-note">Andere productfoto of variant</p>
          {others.length > 1 && (
            <div className="picture-candidates" role="group" aria-label="Andere foto's van dit merk" data-testid="name-photos">
              {others.map((photo) => (
                <button
                  key={photo.imageUrl}
                  type="button"
                  className={photo.imageUrl === chosenName ? "picture-candidate is-active" : "picture-candidate"}
                  aria-pressed={photo.imageUrl === chosenName}
                  aria-label={photo.productName}
                  title={photo.productName}
                  data-testid="name-photo"
                  onClick={() => {
                    dispatch({ type: "choose-name-photo", productId: item.productId, photo });
                    choose("reference");
                  }}
                >
                  <img src={photo.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} onError={() => markBroken(photo.imageUrl)} />
                </button>
              ))}
            </div>
          )}
          {privateLabels.length > 0 && (
            <div className="picture-candidates" role="group" aria-label="Huismerk van deze winkel" data-testid="private-label-photos">
              {privateLabels.map((photo) => (
                <button
                  key={photo.imageUrl}
                  type="button"
                  className={photo.imageUrl === chosenName ? "picture-candidate is-active" : "picture-candidate"}
                  aria-pressed={photo.imageUrl === chosenName}
                  aria-label={photo.productName}
                  title={photo.productName}
                  data-testid="private-label-photo"
                  onClick={() => {
                    dispatch({ type: "choose-name-photo", productId: item.productId, photo });
                    choose("reference");
                  }}
                >
                  <img src={photo.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} onError={() => markBroken(photo.imageUrl)} />
                </button>
              ))}
            </div>
          )}
          {privateLabels.length > 0 && (
            <div className="picture-actions">
              {privateLabels.slice(0, 1).map((photo) => (
                <button
                  key={`adopt-${photo.imageUrl}`}
                  type="button"
                  className="text-button"
                  data-testid="adopt-private-label"
                  onClick={() => {
                    if (!adventure?.retailer) return;
                    dispatch({
                      type: "adopt-commercial",
                      itemId: item.id,
                      name: photo.productName.slice(0, 40),
                      brand: photo.productName.split(" ")[0],
                      privateLabelRetailer: adventure.retailer,
                      photo,
                    });
                    choose("reference");
                  }}
                >
                  Gebruik dit huismerkproduct
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {art?.source === "name" && namePhoto && (
        <small className="picture-source" data-testid="picture-source">
          {namePhotoCredit(namePhoto)}
          {namePhoto.sourceUrl && (
            <>
              {" "}
              <a href={namePhoto.sourceUrl} target="_blank" rel="noreferrer noopener">
                Bron
              </a>
            </>
          )}
        </small>
      )}

      {art?.source === "prijsprofeet" && store && (
        <small className="picture-source" data-testid="picture-source">
          {storeCredit(store)}
          {store.sourceUrl && (
            <>
              {" "}
              <a href={store.sourceUrl} target="_blank" rel="noreferrer noopener">
                Bron
              </a>
            </>
          )}
        </small>
      )}

      {shown && (
        <small className="picture-source" data-testid="picture-source">
          {shown.usageRightsStatus === "permitted" ? (shown.attribution ?? shown.sourceName) : `Van ${shown.sourceName}. Alleen op dit apparaat bewaard; gebruiksrechten onbekend.`}{" "}
          <a href={shown.sourcePageUrl} target="_blank" rel="noreferrer noopener">
            Bron
          </a>
          {shown.matchingStatus === "same-type" && " · een voorbeeld van dit soort product"}
        </small>
      )}

      <div className="picture-actions">
        {settings.referenceImages && wanted && (
          <button type="button" className="text-button" data-testid="picture-refresh" disabled={searching} onClick={() => references.request(identity, { refresh: true })}>
            Opnieuw zoeken
          </button>
        )}
        {shown && (
          <button
            type="button"
            className="text-button"
            data-testid="picture-remove"
            onClick={() => {
              if (identity.generic) return choose(undefined);
              references.choose(identity, null);
              if (item.imageChoice === "reference") choose(undefined);
            }}
          >
            Geen voorbeeldfoto
          </button>
        )}
      </div>
    </section>
  );
}
