import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { markBroken, useBroken } from "../../components/ItemArt";
import { Karrie } from "../../components/mascot/Karrie";
import { ProductArt } from "../../components/ProductArt";
import { PressButton } from "../../components/ui/PressButton";
import { productById } from "../../data/catalog";
import { categoryLabel } from "../../domain/categories";
import { categoryIcon } from "../../domain/categoryIcon";
import { brandLabel } from "../../domain/customProduct";
import { nameImageLookupKey } from "../../domain/imageIdentity";
import { customProducts } from "../../services/customProducts/client";
import { namePhotoCredit, type NameAnswer } from "../../services/images/nameImage";
import { useAdventure } from "../../state/AdventureContext";
import { nameImages, useNameAnswer, useNameImageStatus } from "../../storage/nameImages";
import { newProductView, refusedBrand, wantsTidy, type Tidy } from "./newProduct";

export type NewProductChoice = { tidy: Tidy; answer: NameAnswer | null };

type NewProductSheetProps = {
  name: string;
  /** more: back to the search for the next product; list: on to the list. */
  onAdd: (choice: NewProductChoice, after: "more" | "list") => void;
  onCancel: () => void;
};

const SLOW_MS = 5000;

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}

/** The new-product counterpart of the barcode result: Karrie looks the name up first, then the parent adds it. */
export function NewProductSheet({ name, onAdd, onCancel }: NewProductSheetProps) {
  const { settings, adventure } = useAdventure();
  const key = nameImageLookupKey(name, adventure?.retailer);
  const status = useNameImageStatus(key);
  const answer = useNameAnswer(key);
  const online = useOnline();
  const [tidy, setTidy] = useState<Tidy>({ status: "idle" });
  const [slow, setSlow] = useState(false);
  const alive = useRef(true);
  /** Set in the same tap, so a second tap as the sheet slides away adds nothing. */
  const settled = useRef(false);
  const usable = useBroken();
  const lookup = { status, answer };
  const view = newProductView(lookup, tidy, online);
  const tidyNow = online && wantsTidy(lookup, tidy);
  const searching = view.phase === "searching";

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    nameImages.request(key);
  }, [key]);

  useEffect(() => {
    if (!tidyNow) return;
    setTidy({ status: "running" });
    void customProducts
      .normalize(name)
      .catch(() => ({ status: "retry" as const }))
      .then((outcome) => {
        if (!alive.current) return;
        if (outcome.status === "ok") setTidy({ status: "ok", enrichment: outcome.enrichment, illustrations: outcome.illustrations });
        else if (outcome.status === "refused" && outcome.brand) setTidy({ status: "brand", brand: refusedBrand(name) });
        else setTidy({ status: "none" });
      });
  }, [tidyNow, name]);

  useEffect(() => {
    if (!searching) return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(timer);
  }, [searching]);

  function add(after: "more" | "list") {
    if (settled.current) return;
    settled.current = true;
    onAdd({ tidy, answer }, after);
  }

  const picture = usable(view.photo?.imageUrl);
  const brand = view.brand ? brandLabel({ name, brand: view.brand }) : undefined;
  const category = view.category ?? "pantry";
  const drawing = view.drawing && productById(view.drawing) ? view.drawing : categoryIcon(category);
  const heading = searching ? "Karrie zoekt…" : view.phase === "found" ? (picture ? "Gevonden!" : "Herkend!") : view.phase === "offline" ? "Geen internet" : "Nieuw product";

  const footer = picture && view.photo
    ? namePhotoCredit(view.photo)
    : tidy.status === "ok"
      ? "Afdeling herkend met OpenAI. Controleer het altijd even zelf."
      : view.brand
        ? settings.referenceImages
          ? "Merk herkend. Karrie zoekt er nog een voorbeeldfoto bij."
          : "Merk herkend. Een voorbeeldfoto kiezen kan in je lijstje."
        : null;

  return (
    <>
      <h2>{heading}</h2>
      <div className="scan-card photo-card" data-testid="new-card" aria-busy={searching}>
        {searching ? (
          <span className="scan-card-art new-product-wait" aria-hidden="true">
            <Karrie mood="searching" />
          </span>
        ) : picture ? (
          <span className="product-art item-photo scan-card-art">
            <img src={picture} alt="" referrerPolicy="no-referrer" onError={() => markBroken(picture)} />
          </span>
        ) : (
          <ProductArt id={drawing} className="scan-card-art" />
        )}
        <div className="scan-card-text">
          <strong>{name}</strong>
          {searching ? (
            <span className="new-product-status" role="status" data-testid="new-wait">
              <span className="scanner-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              Karrie zoekt een foto en de afdeling
            </span>
          ) : (
            <>
              {brand && <span data-testid="new-brand">{brand}</span>}
              {view.phase !== "offline" && <span data-testid="new-category">{categoryLabel(category)}</span>}
              {view.photo && <small>{view.photo.productName}</small>}
            </>
          )}
        </div>
      </div>
      {searching && slow && <p className="sheet-note">Dit duurt soms even. Toevoegen kan nu al; Karrie zoekt dan op de achtergrond verder.</p>}
      {view.phase === "offline" && <p className="sheet-note">Toevoegen kan gewoon. Karrie zoekt de foto en de afdeling zodra er weer internet is.</p>}
      {view.phase === "plain" && <p className="sheet-note">Karrie vond er niets over. De afdeling aanpassen kan in je lijstje.</p>}
      <PressButton variant="primary" wide data-testid="new-add" onClick={() => add("more")}>
        Toevoegen en verder
      </PressButton>
      <PressButton variant="secondary" wide data-testid="new-add-list" onClick={() => add("list")}>
        Toevoegen en naar lijstje
      </PressButton>
      <div className="sheet-actions scan-actions">
        <PressButton variant="quiet" data-testid="new-cancel" onClick={onCancel}>
          Annuleren
        </PressButton>
      </div>
      {footer && <p className="scan-attribution">{footer}</p>}
    </>
  );
}
