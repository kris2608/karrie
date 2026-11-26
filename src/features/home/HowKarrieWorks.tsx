import type { Ref } from "react";
import { ItemArt } from "../../components/ItemArt";
import { Karrie } from "../../components/mascot/Karrie";
import { StickerBadge } from "../../components/StickerBadge";
import { PressButton } from "../../components/ui/PressButton";
import { StarIcon } from "../../components/ui/StarIcon";
import { RETAILERS } from "../../domain/retailers";
import { Attribution, TagIcon } from "../offers/OfferTag";

const LIST_ART = [
  { icon: "banaan", name: "Banaan" },
  { icon: "appel", name: "Appel" },
  { icon: "melk", name: "Melk" },
];

type HowKarrieWorksProps = {
  headingRef: Ref<HTMLHeadingElement>;
  /** First-time home only: an explicit button that starts a list. Closing the sheet does not. */
  onStart?: () => void;
};

export function HowKarrieWorks({ headingRef, onStart }: HowKarrieWorksProps) {
  return (
    <article className="howto" data-testid="how-karrie-works">
      <div className="howto-body">
      <header className="howto-intro">
        <Karrie mood="idle" className="howto-mascot" />
        <div>
          <h2 ref={headingRef} tabIndex={-1}>
            Hoe werkt Karrie?
          </h2>
          <p>Een boodschappenlijstje voor jou. Een speurtocht voor je kind.</p>
        </div>
      </header>

      <section className="howto-step">
        <h3>
          <span aria-hidden="true">📝</span> 1. Maak samen een lijstje
        </h3>
        <p>Kies, zoek, fotografeer of scan de boodschappen die jullie nodig hebben.</p>
        <div className="howto-art" aria-hidden="true">
          {LIST_ART.map((item) => (
            <span key={item.icon} className="howto-tile">
              <ItemArt item={item} />
              <svg className="howto-check" viewBox="0 0 24 24">
                <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          ))}
        </div>
      </section>

      <section className="howto-step">
        <h3>
          <span aria-hidden="true">🔍</span> 2. Ga op speurtocht
        </h3>
        <p>Karrie laat één voor één zien welke boodschappen je kind mag zoeken.</p>
        <div className="howto-art" aria-hidden="true">
          <span className="howto-found">Gevonden!</span>
        </div>
      </section>

      <section className="howto-step">
        <h3>
          <span aria-hidden="true">⭐</span> 3. Verdien sterren en stickers
        </h3>
        <p>Elk gevonden product levert een ster op. Verzamel stickers met jullie avonturen!</p>
        <div className="howto-art" aria-hidden="true">
          <StarIcon className="howto-star" />
          <span className="sticker-slot">
            <StickerBadge id="appel" />
          </span>
          <span className="sticker-slot">
            <StickerBadge id="kar" />
          </span>
        </div>
      </section>

      <section className="howto-good">
        <h3>Supermarkt en aanbiedingen</h3>
        <p>Kies je supermarkt en ontdek welke producten op je lijstje in de aanbieding zijn. Je kunt Karrie ook zonder supermarkt gebruiken.</p>
        <div className="howto-art howto-stores">
          <span className="sr-only">Je kiest uit {RETAILERS.map((retailer) => retailer.name).join(", ").replace(/, ([^,]*)$/, " of $1")}.</span>
          {RETAILERS.map((retailer) => (
            <span key={retailer.id} className="chip howto-chip" aria-hidden="true">
              {retailer.name}
            </span>
          ))}
          <span className="offer-tag" aria-hidden="true">
            <TagIcon />
            <span>Aanbieding</span>
          </span>
        </div>
        <p className="howto-small">Niet ieder product heeft een aanbieding. Controleer de prijs en voorwaarden altijd even in de winkel.</p>
        <Attribution />
      </section>

      <section className="howto-good">
        <h3>Goed om te weten</h3>
        <ul>
          <li>Je kunt je lijstjes bewaren en opnieuw gebruiken.</li>
          <li>Karrie is gratis en een account is niet nodig.</li>
          <li>Extra missies zijn altijd vrijblijvend. Met ‘Nu niet’ gaan jullie gewoon verder.</li>
        </ul>
      </section>

      </div>
      {onStart && (
        <div className="howto-actions">
          <PressButton variant="primary" size="l" wide data-testid="intro-start" onClick={onStart}>
            Start je eerste speurtocht
          </PressButton>
        </div>
      )}
    </article>
  );
}
