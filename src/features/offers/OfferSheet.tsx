import { mechanismText, validUntilText, type Offer, type Shown } from "../../domain/offers";
import { retailerName } from "../../domain/retailers";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { Attribution, TagIcon } from "./OfferTag";

export type OpenOffer = { itemName: string; offer: Offer; shown: Shown };

export function OfferSheet({ open, onClose }: { open: OpenOffer | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(open)} onClose={onClose} label="Aanbieding">
      {open && <OfferDetails {...open} />}
      <PressButton variant="quiet" wide onClick={onClose}>
        Sluiten
      </PressButton>
    </Sheet>
  );
}

function OfferDetails({ itemName, offer, shown }: OpenOffer) {
  const store = retailerName(offer.retailer);
  const { headline, price, conditions } = mechanismText(offer);
  const until = validUntilText(offer);
  return (
    <div className="offer-details" data-testid="offer-sheet">
      <p className={shown === "maybe" ? "offer-kicker is-maybe" : "offer-kicker"}>
        <TagIcon />
        {shown === "deal" ? `Aanbieding bij ${store}` : `Mogelijke aanbieding bij ${store}`}
      </p>
      <h2>{headline}</h2>
      {price && <p className="offer-price">{price}</p>}
      <dl className="offer-facts">
        <div>
          <dt>Product</dt>
          <dd>
            {offer.productName}
            {offer.quantity && <span className="offer-quantity"> · {offer.quantity}</span>}
          </dd>
        </div>
        {until && (
          <div>
            <dt>Geldig</dt>
            <dd>{until}</dd>
          </div>
        )}
        {conditions.length > 0 && (
          <div>
            <dt>Voorwaarden</dt>
            <dd>{conditions.join(" · ")}</dd>
          </div>
        )}
      </dl>
      {shown === "maybe" && <p className="offer-note">Controleer in de winkel of dit jouw product is. Op je lijstje staat: {itemName}.</p>}
      <div className="offer-links">
        {offer.sourceUrl && (
          <a href={offer.sourceUrl} target="_blank" rel="noopener noreferrer">
            Bekijk bij {store}
          </a>
        )}
        <Attribution />
      </div>
    </div>
  );
}
