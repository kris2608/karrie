import { useEffect } from "react";
import { hasPhoto } from "../../components/ItemArt";
import { identityKey, identityOf, wantsReference } from "../../domain/imageIdentity";
import type { AdventureItem, ImageChoice } from "../../domain/types";
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
  const { settings, dispatch } = useAdventure();
  const identity = identityOf(item);
  const wanted = wantsReference(identity, item.imageChoice);
  const entry = useReference(identity);
  const shown = wanted ? shownImage(entry) : null;
  const searching = useSearching(identity);
  const key = identity ? identityKey(identity) : null;

  useEffect(() => {
    if (settings.referenceImages && wanted) references.request(identity);
  }, [key, wanted, settings.referenceImages]);
  const candidates = wanted ? (entry?.discovery?.candidates ?? []) : [];
  const photo = hasPhoto(item);
  const active: ImageChoice = item.imageChoice ?? (shown ? "reference" : photo ? "photo" : "drawing");
  const status = !wanted ? null : searching ? "searching" : entry?.chosen === null ? "removed" : shown ? null : entry?.state;
  /** A standard product only searches when the parent asks for a picture. */
  const optIn = Boolean(identity?.generic && settings.referenceImages);

  const choose = (choice: ImageChoice | undefined) => dispatch({ type: "set-image-choice", itemId: item.id, choice });
  const pick = (choice: ImageChoice) => {
    if (choice === "reference" && identity && entry?.chosen === null) references.choose(identity, undefined);
    choose(choice);
  };
  const choices: { id: ImageChoice; label: string; show: boolean }[] = [
    { id: "reference", label: "Voorbeeldfoto", show: Boolean(shown) || optIn },
    { id: "photo", label: "Eigen foto", show: photo },
    { id: "drawing", label: "Tekening", show: true },
  ];

  if (!identity || (!settings.referenceImages && !entry)) return null;

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
