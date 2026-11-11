import type { Ref } from "react";
import { FEEDBACK_PRIVACY, feedbackUrl } from "../../domain/feedback";

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
        <h3>Lijstje delen</h3>
        <p>
          Als je een lijstje deelt, bewaart Karrie 48 uur een tijdelijke kopie op de server en geeft je een korte link. Iedereen met die link kan het
          lijstje openen en krijgt een eigen lokale kopie. Er is geen gezamenlijk bewerken. Ouderfoto&apos;s en herkenningsgegevens gaan niet mee.
        </p>
      </section>
      <section>
        <h3>Producten herkennen</h3>
        <p>
          Tik je op de ontspanknop, dan gaat die foto via de server van Karrie naar OpenAI om het product te herkennen. Het live camerabeeld en het
          lezen van streepjescodes blijven op je toestel. Voor streepjescodes, voorbeeldfoto's en aanbiedingen stuurt Karrie productgegevens (naam,
          merk of streepjescode) naar externe diensten, zoals Open Food Facts en PrijsProfeet. Voeg je zelf een product toe, dan gaat alleen die
          productnaam naar de server en OpenAI. Gevonden productgegevens kunnen in een gedeelde catalogus op de server landen, zodat andere gezinnen
          dezelfde streepjescode sneller herkennen. Behalve tijdelijke deellinks uploadt Karrie geen boodschappenlijstjes, persoonlijke foto's of
          accounts.
        </p>
      </section>
      <section>
        <h3>Karrie verbeteren</h3>
        <p>
          Met Umami tellen we anoniem hoe de app wordt gebruikt, bijvoorbeeld welk scherm opent, of iemand terugkomt, hoe een product is toegevoegd
          en of herkennen of delen lukte. Umami zet geen cookies. We sturen geen namen, productfoto&apos;s of de inhoud van je boodschappenlijstjes
          naar Umami. Bij een deellink telt Umami alleen het pad /l, zonder de geheime code.
        </p>
        <p>
          Via <a href={feedbackUrl("settings")} target="_blank" rel="noopener noreferrer">Geef feedback</a> kun je vrijwillig iets doorgeven. Wat je
          invult, gaat naar <a href="https://tally.so" rel="noopener noreferrer">Tally</a>; Karrie stuurt geen boodschappenlijst, producten of
          kindgegevens mee. Zie ook de{" "}
          <a href={FEEDBACK_PRIVACY} target="_blank" rel="noopener noreferrer">
            privacy-informatie van Tally
          </a>
          .
        </p>
      </section>
      <section>
        <h3>Zelf de controle houden</h3>
        <p>
          Je kunt bewaarde lijstjes verwijderen in de instellingen, en Mijn producten vergeten via de i-knop en Aanpassen. Gegevens die lokaal in je browser
          staan, kun je ook via de browserinstellingen wissen.
        </p>
      </section>
      <a className="privacy-link" href="/privacy.html" target="_blank" rel="noopener">
        Lees de volledige privacyverklaring
      </a>
    </article>
  );
}
