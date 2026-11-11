import { useState } from "react";
import { ItemArt } from "../../components/ItemArt";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { productHeading } from "../../domain/productHeading";
import { SHARED_IMPORT_LIST_NAME, toImportSavedItems, type SharedListV1 } from "../../domain/shareList";
import type { Adventure } from "../../domain/types";

export type ImportMode = "merge" | "create";

export type ImportSharedListSheetProps = {
  list: SharedListV1 | null;
  adventure: Adventure | null;
  onClose: () => void;
  onImport: (mode: ImportMode, name?: string) => void;
};

function hasCurrentList(adventure: Adventure | null): boolean {
  return Boolean(adventure && adventure.items.length > 0 && (adventure.phase === "draft" || adventure.phase === "shopping"));
}

/** Preview a shared-list snapshot and confirm before writing anything local. */
export function ImportSharedListSheet({ list, adventure, onClose, onImport }: ImportSharedListSheetProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [name, setName] = useState("");
  const current = hasCurrentList(adventure);
  const items = list ? toImportSavedItems(list) : [];
  const defaultName = list?.name?.trim() || SHARED_IMPORT_LIST_NAME;
  const listName = name.trim() || defaultName;

  function requestCreate() {
    if (current) {
      setConfirmOpen(true);
      return;
    }
    onImport("create", listName);
  }

  return (
    <>
      <Sheet open={Boolean(list)} onClose={onClose} label={SHARED_IMPORT_LIST_NAME}>
        {list && (
          <div className="share-import" data-testid="import-shared-list">
            <h2>Gedeeld lijstje</h2>
            <p className="share-note">
              {defaultName} · {items.length} {items.length === 1 ? "product" : "producten"}
            </p>
            <ul className="share-import-items" aria-label="Producten in dit lijstje">
              {items.slice(0, 12).map((item, index) => {
                const heading = productHeading({ name: item.name, brand: item.brand, packageSize: item.packageSize });
                const detail = [heading.subtitle, item.quantity > 1 ? `×${item.quantity}` : null].filter(Boolean).join(" · ");
                return (
                  <li key={`${item.productId}-${index}`}>
                    <ItemArt item={item} />
                    <span>
                      <strong>{heading.title}</strong>
                      {detail ? <small className="item-detail">{detail}</small> : null}
                    </span>
                  </li>
                );
              })}
              {items.length > 12 && <li className="share-import-more">+{items.length - 12} meer</li>}
            </ul>
            <label className="share-import-name">
              <span className="sr-only">Naam voor nieuw lijstje</span>
              <input
                data-testid="import-list-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={defaultName}
                maxLength={40}
                autoComplete="off"
              />
            </label>
            <div className="sheet-actions share-import-actions">
              {current && (
                <PressButton type="button" variant="quiet" data-testid="import-merge" onClick={() => onImport("merge")}>
                  Toevoegen aan huidig lijstje
                </PressButton>
              )}
              <PressButton type="button" variant="primary" data-testid="import-create" onClick={requestCreate}>
                Nieuw lijstje
              </PressButton>
              {!current && (
                <PressButton type="button" variant="quiet" onClick={onClose}>
                  Annuleer
                </PressButton>
              )}
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} label="Huidig lijstje blijft bewaard">
        <div className="share-import">
          <h2>Huidig lijstje blijft bewaard</h2>
          <p className="sheet-note">
            Je openstaande lijstje blijft op dit apparaat. Daarna openen we <strong>{listName}</strong>.
          </p>
          <div className="sheet-actions">
            <PressButton type="button" variant="quiet" onClick={() => setConfirmOpen(false)}>
              Annuleer
            </PressButton>
            <PressButton
              type="button"
              variant="primary"
              data-testid="import-interrupt-confirm"
              onClick={() => {
                setConfirmOpen(false);
                onImport("create", listName);
              }}
            >
              Doorgaan
            </PressButton>
          </div>
        </div>
      </Sheet>
    </>
  );
}

export function ImportSharedListErrorSheet({
  open,
  onClose,
  expired = false,
}: {
  open: boolean;
  onClose: () => void;
  expired?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} label={expired ? "Lijstje verlopen" : "Lijstje kan niet worden geopend"}>
      <div className="share-import" data-testid="import-shared-error">
        <h2>{expired ? "Dit boodschappenlijstje is verlopen" : "Dit lijstje kan niet worden geopend"}</h2>
        <p className="sheet-note">
          {expired
            ? "Vraag de afzender om het opnieuw te delen."
            : "De link is ongeldig of tijdelijk niet bereikbaar."}
        </p>
        <div className="sheet-actions">
          <PressButton type="button" variant="primary" wide data-testid="import-error-home" onClick={onClose}>
            Ga naar Karrie
          </PressButton>
        </div>
      </div>
    </Sheet>
  );
}
