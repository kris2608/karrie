import { useState } from "react";
import { ItemArt } from "../../components/ItemArt";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { productHeading } from "../../domain/productHeading";
import { retailerName } from "../../domain/retailers";
import { SHARED_IMPORT_LIST_NAME, toImportSavedItems, type SharedListV1 } from "../../domain/shareList";
import type { Adventure } from "../../domain/types";

export type ImportSharedListSheetProps = {
  list: SharedListV1 | null;
  adventure: Adventure | null;
  onClose: () => void;
  onImport: (mode: "open" | "save-only") => void;
};

function hasUnfinished(adventure: Adventure | null): boolean {
  return Boolean(adventure && adventure.items.length > 0 && (adventure.phase === "draft" || adventure.phase === "shopping"));
}

/** Preview a shared-list snapshot and confirm before writing anything local. */
export function ImportSharedListSheet({ list, adventure, onClose, onImport }: ImportSharedListSheetProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const unfinished = hasUnfinished(adventure);
  const items = list ? toImportSavedItems(list) : [];
  const title = list?.name?.trim() || SHARED_IMPORT_LIST_NAME;
  const store = list?.retailer ? retailerName(list.retailer) : null;

  function requestOpen() {
    if (unfinished) {
      setConfirmOpen(true);
      return;
    }
    onImport("open");
  }

  return (
    <>
      <Sheet open={Boolean(list)} onClose={onClose} label={SHARED_IMPORT_LIST_NAME}>
        {list && (
          <div className="share-import" data-testid="import-shared-list">
            <h2>Dit lijstje openen?</h2>
            <p className="share-note">
              {title}
              {store ? ` · ${store}` : ""} · {items.length} {items.length === 1 ? "product" : "producten"}
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
            {unfinished ? (
              <div className="sheet-actions share-import-actions">
                <PressButton type="button" variant="quiet" data-testid="import-save-only" onClick={() => onImport("save-only")}>
                  Bewaar als nieuw lijstje
                </PressButton>
                <PressButton type="button" variant="primary" data-testid="import-use-now" onClick={requestOpen}>
                  Gebruik dit lijstje
                </PressButton>
              </div>
            ) : (
              <div className="sheet-actions">
                <PressButton type="button" variant="quiet" onClick={onClose}>
                  Annuleer
                </PressButton>
                <PressButton type="button" variant="primary" data-testid="import-confirm" onClick={() => onImport("open")}>
                  Gebruik dit lijstje
                </PressButton>
              </div>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} label="Huidig lijstje bewaren">
        <div className="share-import">
          <h2>Je huidige lijstje bewaren?</h2>
          <p className="share-note">Je openstaande lijstje wordt eerst bewaard, daarna openen we het gedeelde lijstje.</p>
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
                onImport("open");
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
        <p className="share-note">
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
