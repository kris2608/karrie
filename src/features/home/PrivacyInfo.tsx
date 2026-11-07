import type { Ref } from "react";

export function PrivacyInfo({ headingRef }: { headingRef: Ref<HTMLHeadingElement> }) {
  return (
    <article className="privacy-info" data-testid="privacy-info">
      <h2 ref={headingRef} tabIndex={-1}>
        Privacy en gegevens
      </h2>
      <section>
        <h3>Jouw lijstjes blijven van jou</h3>
        <p>Je boodschappenlijstjes, voortgang, Mijn producten en de foto's die je bewaart, staan op je eigen apparaat. Er is geen account.</p>
      </section>
      <section>
        <h3>Producten herkennen</h3>
        <p>
          Tik je op de ontspanknop, dan gaat die foto via de server van Karrie naar OpenAI om het product te herkennen. Het live camerabeeld en het
          lezen van streepjescodes blijven op je toestel. Voor streepjescodes, voorbeeldfoto's en aanbiedingen stuurt Karrie productgegevens (naam,
          merk of streepjescode) naar externe diensten, zoals Open Food Facts en PrijsProfeet.
        </p>
      </section>
      <section>
        <h3>Karrie verbeteren</h3>
        <p>
          Met Umami tellen we anoniem hoe de app wordt gebruikt, bijvoorbeeld welk scherm opent en hoe een product is toegevoegd. Umami zet geen
          cookies. We sturen geen namen, productfoto's of de inhoud van je boodschappenlijstjes naar Umami.
        </p>
      </section>
      <section>
        <h3>Zelf de controle houden</h3>
        <p>
          Je kunt bewaarde lijstjes verwijderen in de instellingen, en Mijn producten vergeten door lang te drukken. Gegevens die lokaal in je browser
          staan, kun je ook via de browserinstellingen wissen.
        </p>
      </section>
      <a className="privacy-link" href="/privacy.html" target="_blank" rel="noopener">
        Lees de volledige privacyverklaring
      </a>
    </article>
  );
}
