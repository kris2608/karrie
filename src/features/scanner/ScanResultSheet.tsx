import { useState } from "react";
import { hasPhoto, ItemArt } from "../../components/ItemArt";
import { ProductArt } from "../../components/ProductArt";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { CATEGORIES } from "../../domain/categories";
import { categoryIcon } from "../../domain/categoryIcon";
import { sameEan } from "../../domain/ean";
import { normalize } from "../../domain/matchProduct";
import { matchesItemType } from "../../domain/productType";
import type { AdventureItem, CategoryId, ScannedProduct } from "../../domain/types";
import { products } from "../../data/catalog";
import { useAdventure } from "../../state/AdventureContext";
import type { LookupOutcome } from "./BarcodeScanner";

type ScanResultSheetProps = {
  result: LookupOutcome | null;
  target?: AdventureItem;
  items: AdventureItem[];
  onRescan: () => void;
  onClose: () => void;
  onDone: (message: string) => void;
  onEdit?: (itemId: string) => void;
};

export function ScanResultSheet(props: ScanResultSheetProps) {
  const { result } = props;
  return (
    <Sheet open={Boolean(result)} onClose={props.onClose} label="Gescand product">
      {result && <ResultBody key={result.ean} {...props} result={result} />}
    </Sheet>
  );
}

function open(items: AdventureItem[]) {
  return items.filter((item) => item.status !== "found");
}

function ResultBody({ result, target, items, onRescan, onClose, onDone, onEdit }: ScanResultSheetProps & { result: LookupOutcome }) {
  const { dispatch } = useAdventure();
  const found = result.status === "found" ? result.product : null;
  const product: ScannedProduct = found ?? { ean: result.ean, categoryTags: [], category: target?.category ?? "pantry" };
  const [name, setName] = useState(found?.name ?? "");
  const [category, setCategory] = useState<CategoryId>(product.category);
  const [icon, setIcon] = useState(() => (product.matchProductId ? product.matchProductId : categoryIcon(product.category)));
  const [linking, setLinking] = useState(false);
  const openItems = open(items);
  const duplicate = openItems.find((item) => item.id !== target?.id && sameEan(item.ean, result.ean));
  const candidates = found ? openItems.filter((item) => !item.ean && !hasPhoto(item) && matchesItemType(found, item.productId)) : [];
  const label = [product.brand, product.packageSize].filter(Boolean).join(" · ");

  function attach(item: AdventureItem) {
    dispatch({ type: "attach-pack", itemId: item.id, product, source: found ? "off" : "manual" });
    onDone(found?.imageUrl ? `Productfoto staat bij ${item.name}` : `Barcode gekoppeld aan ${item.name}`);
  }

  function addNew(source: "off" | "manual") {
    const finalName = name.trim();
    if (!finalName) return;
    dispatch({ type: "add-scanned", product, name: finalName, category, icon, source });
    onDone(`${finalName} staat op je lijst`);
  }

  const card = (
    <div className="scan-card" data-testid="scan-card">
      <ItemArt
        item={{ icon, name: name || product.ean, imageUrl: found?.imageUrl, imageKind: found?.imageUrl ? "photo" : "generic" }}
        className="scan-card-art"
      />
      <div className="scan-card-text">
        <strong>{found?.name ?? (target ? target.name : "Onbekend product")}</strong>
        {label && <span>{label}</span>}
        <small>EAN {product.ean}</small>
      </div>
    </div>
  );

  const attribution = found && <p className="scan-attribution">Gegevens: Open Food Facts (ODbL), foto's CC BY-SA</p>;

  if (target) {
    return (
      <>
        <h2>{found ? `Deze verpakking voor ${target.name}?` : "Dit product kennen we nog niet"}</h2>
        {card}
        {!found && (
          <p className="sheet-note">
            {result.status === "not-found"
              ? "Er is geen foto. Je kunt de barcode wel koppelen, dan kan Karrie hem in de winkel herkennen."
              : "Karrie kan dit nu niet opzoeken. Koppel de barcode zonder foto of probeer het straks nog eens."}
          </p>
        )}
        {duplicate && <p className="sheet-note">Let op: deze barcode hoort al bij {duplicate.name}.</p>}
        <PressButton variant="primary" wide data-testid="use-photo" onClick={() => attach(target)}>
          {found?.imageUrl ? "Gebruik productfoto" : "Koppel barcode"}
        </PressButton>
        <div className="sheet-actions scan-actions">
          <PressButton variant="quiet" onClick={onClose}>
            Annuleren
          </PressButton>
          <PressButton variant="secondary" onClick={onRescan}>
            Opnieuw scannen
          </PressButton>
        </div>
        {attribution}
      </>
    );
  }

  if (duplicate) {
    return (
      <>
        <h2>Staat al op je lijst</h2>
        <div className="scan-card">
          <ItemArt item={duplicate} className="scan-card-art" />
          <div className="scan-card-text">
            <strong>{duplicate.name}</strong>
            <span>{duplicate.quantity}× op de lijst</span>
          </div>
        </div>
        <PressButton
          variant="primary"
          wide
          data-testid="scan-plus-one"
          onClick={() => {
            dispatch({ type: "set-quantity", itemId: duplicate.id, quantity: duplicate.quantity + 1 });
            onDone(`${duplicate.name}: ${Math.min(24, duplicate.quantity + 1)}×`);
          }}
        >
          +1 erbij
        </PressButton>
        <div className="sheet-actions scan-actions">
          <PressButton variant="quiet" onClick={onClose}>
            Annuleren
          </PressButton>
          {onEdit && (
            <PressButton variant="secondary" onClick={() => onEdit(duplicate.id)}>
              Bewerken
            </PressButton>
          )}
        </div>
      </>
    );
  }

  if (linking) {
    return (
      <>
        <h2>Koppel aan een product op je lijst</h2>
        {card}
        <ul className="scan-pick">
          {openItems.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => attach(item)}>
                <ItemArt item={item} />
                <span>{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <PressButton variant="quiet" wide onClick={() => setLinking(false)}>
          Terug
        </PressButton>
      </>
    );
  }

  if (found && candidates.length > 0) {
    const single = candidates.length === 1 ? candidates[0] : null;
    return (
      <>
        <h2>{single ? `Wil je deze productfoto gebruiken voor ${single.name}?` : "Bij welk product hoort deze foto?"}</h2>
        {card}
        {single ? (
          <PressButton variant="primary" wide data-testid="use-photo" onClick={() => attach(single)}>
            {found.imageUrl ? "Gebruik productfoto" : "Koppel barcode"}
          </PressButton>
        ) : (
          <ul className="scan-pick">
            {candidates.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => attach(item)}>
                  <ItemArt item={item} />
                  <span>{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="sheet-actions scan-actions">
          <PressButton variant="quiet" onClick={onClose}>
            Annuleren
          </PressButton>
          <PressButton variant="secondary" data-testid="add-as-new" disabled={!name.trim()} onClick={() => addNew("off")}>
            Als nieuw product
          </PressButton>
        </div>
        <button type="button" className="text-button" onClick={() => setLinking(true)}>
          Koppel aan ander product op je lijst
        </button>
        {attribution}
      </>
    );
  }

  const unknown = !found;
  return (
    <>
      <h2>{unknown ? (result.status === "not-found" ? "Dit product kennen we nog niet." : "Karrie kan dit nu niet opzoeken") : "Gevonden!"}</h2>
      {card}
      {result.status === "offline" && <p className="sheet-note">Geen internet. Je kunt het product zelf een naam geven en toch toevoegen.</p>}
      {result.status === "error" && <p className="sheet-note">Open Food Facts reageert nu niet. Je kunt het product zelf toevoegen.</p>}
      {(unknown || !found?.name) && (
        <label className="scan-field">
          <span>Hoe heet het?</span>
          <input data-testid="scan-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Bijvoorbeeld: pindakaas" autoComplete="off" maxLength={40} />
        </label>
      )}
      {unknown && <DrawingPicker name={name} category={category} icon={icon} onPick={setIcon} />}
      <fieldset className="scan-field">
        <legend>Waar ligt het in de winkel?</legend>
        <div className="chips">
          {CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === category ? "chip is-active" : "chip"}
              aria-pressed={entry.id === category}
              onClick={() => {
                setCategory(entry.id);
                if (!product.matchProductId && icon === categoryIcon(category)) setIcon(categoryIcon(entry.id));
              }}
            >
              {entry.short}
            </button>
          ))}
        </div>
      </fieldset>
      <PressButton variant="primary" wide data-testid="scan-add" disabled={!name.trim()} onClick={() => addNew(unknown ? "manual" : "off")}>
        {unknown ? "Toch toevoegen" : "Toevoegen aan lijst"}
      </PressButton>
      <div className="sheet-actions scan-actions">
        <PressButton variant="quiet" onClick={onClose}>
          Annuleren
        </PressButton>
        <PressButton variant="secondary" onClick={onRescan}>
          {unknown ? "Ander product scannen" : "Opnieuw scannen"}
        </PressButton>
      </div>
      {openItems.length > 0 && (
        <button type="button" className="text-button" onClick={() => setLinking(true)}>
          Koppel aan ander product op je lijst
        </button>
      )}
      {attribution}
    </>
  );
}

export function DrawingPicker({ name, category, icon, onPick }: { name: string; category: CategoryId; icon: string; onPick: (id: string) => void }) {
  const needle = normalize(name);
  const named = needle
    ? products.filter((product) => normalize(product.name).includes(needle) || product.aliases.some((alias) => normalize(alias).includes(needle)))
    : [];
  const pool = named.length ? named : products.filter((product) => product.category === category);
  const options = [icon, categoryIcon(category), ...pool.map((product) => product.id)]
    .filter((id, index, all) => all.indexOf(id) === index)
    .slice(0, 6);

  return (
    <fieldset className="scan-field">
      <legend>Kies een tekening</legend>
      <div className="scan-drawings">
        {options.map((id) => (
          <button key={id} type="button" className={id === icon ? "is-active" : undefined} aria-pressed={id === icon} aria-label={`Tekening ${id}`} onClick={() => onPick(id)}>
            <ProductArt id={id} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
