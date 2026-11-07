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
  /** Given only before a first adventure: shows "Aan de slag!" and "Overslaan". */
  onStart?: () => void;
  onSkip?: () => void;
};

export function HowKarrieWorks({ headingRef, onStart, onSkip }: HowKarrieWorksProps) {
  return (
    <article className="howto" data-testid="how-karrie-works">
      <header className="howto-intro">
        <Karrie mood="idle" className="howto-mascot" />
        <div>
          <h2 ref={headingRef} tabIndex={-1}>
            Hoe werkt Karrie? 🛒
          </h2>
          <p>Met Karrie wordt boodschappen doen een avontuur voor kleine speurneuzen! Maak samen een lijstje, zoek de producten in de winkel en verdien sterren.</p>
        </div>
      </header>

      <section className="howto-step">
        <h3>
          <span aria-hidden="true">📝</span> 1. Maak samen een lijstje
        </h3>
        <p>Kies wat jullie nodig hebben. Tik op producten, zoek op naam of gebruik de camera om een verpakking te herkennen. Ook een streepjescode scannen kan!</p>
        <p className="howto-small">Je kind mag meekiezen en producten herkennen; de camera bedien je samen.</p>
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
          <span aria-hidden="true">🏷️</span> 2. Kies je supermarkt
        </h3>
        <p>Kies waar jullie boodschappen gaan doen. Karrie laat bij producten op jullie lijstje zien of er een passende aanbieding is.</p>
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
        <p className="howto-small">
          Kiezen hoeft niet. Je kunt de supermarkt wijzigen bij Toevoegen, Controleren of in de instellingen. Aanbiedingen zie je op het lijstje en
          tijdens de speurtocht, als klein label bij het product.
        </p>
        <Attribution />
      </section>

      <section className="howto-step">
        <h3>
          <span aria-hidden="true">🔍</span> 3. Ga samen op speurtocht
        </h3>
        <p>In de winkel laat Karrie zien wat jullie zoeken. Gevonden? Tik op 'Gevonden!' en het product gaat in Karrie's mandje.</p>
        <div className="howto-art" aria-hidden="true">
          <span className="howto-found">Gevonden!</span>
        </div>
        <p className="howto-small">Soms heeft Karrie een extra speurmissie! Die is altijd vrijblijvend: met 'Nu niet' gaan jullie gewoon verder.</p>
        <p className="howto-small">Een bonusmissie stelt soms een vergelijkbaar product voor. Kijk samen op het etiket; jullie kiezen zelf.</p>
      </section>

      <section className="howto-step">
        <h3>
          <span aria-hidden="true">⭐</span> 4. Verzamel sterren en stickers
        </h3>
        <p>Voor ieder gevonden product verdient je kind een ster. Is alles gevonden? Dan vieren jullie het avontuur en kunnen jullie stickers verzamelen!</p>
        <div className="howto-art" aria-hidden="true">
          <StarIcon className="howto-star" />
          <span className="sticker-slot">
            <StickerBadge id="appel" />
          </span>
          <span className="sticker-slot">
            <StickerBadge id="kar" />
          </span>
        </div>
        <p className="howto-small">Bewaar een lijstje en gebruik het later opnieuw.</p>
      </section>

      <section className="howto-good">
        <h3>Goed om te weten</h3>
        <ul>
          <li>Je kunt je lijstjes bewaren en opnieuw gebruiken.</li>
          <li>Een account is niet nodig.</li>
          <li>Extra missies zijn altijd vrijblijvend.</li>
        </ul>
      </section>

      {onStart && (
        <div className="howto-actions">
          <PressButton variant="primary" size="l" wide data-testid="intro-start" onClick={onStart}>
            Aan de slag!
          </PressButton>
          <PressButton variant="quiet" size="s" wide data-testid="intro-skip" onClick={onSkip ?? onStart}>
            Overslaan
          </PressButton>
        </div>
      )}
    </article>
  );
}
