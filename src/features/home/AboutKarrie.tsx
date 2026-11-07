import type { Ref } from "react";

export function AboutKarrie({ headingRef }: { headingRef: Ref<HTMLHeadingElement> }) {
  return (
    <article className="about-story" data-testid="about-karrie">
      <img
        className="about-art"
        src="/images/karrie_thomas_over-ons.webp"
        alt="Thomas duwt het vrolijke winkelwagentje Karrie"
        width={720}
        height={900}
        decoding="async"
      />
      <h2 ref={headingRef} tabIndex={-1}>
        Hoe Karrie begon... 🛒
      </h2>
      <p>
        <strong>Het begon met Thomas en een winkelwagentje...</strong>
      </p>
      <p>Samen met Kristian boodschappen doen? Dat was voor Thomas één groot avontuur!</p>
      <p>Bananen zoeken, naar de appels wijzen en natuurlijk het liefst zélf het winkelwagentje duwen.</p>
      <p>Terwijl Thomas vrolijk door de supermarkt speurde, kreeg Kristian een idee: wat als boodschappen doen gewoon een spelletje wordt?</p>
      <p>
        En zo werd Karrie geboren! Een vrolijk winkelwagentje dat kinderen helpt om thuis boodschappen te verzamelen en ze daarna in de winkel terug
        te vinden.
      </p>
      <p className="about-pill">Biep! Gevonden! ⭐</p>
    </article>
  );
}
