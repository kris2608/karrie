import { describe, expect, it } from "vitest";
import { raw, SHOP_PAGE } from "../test/fixtures.js";
import { guardFacts, pageEvidence, worthReading } from "./facts.js";

const SOURCE = { url: "https://www.ah.nl/producten/terra", name: "ah.nl", at: 1 };

describe("product page evidence", () => {
  it("reads JSON-LD, the Nutri-Score image and the nutrition passage, not tracking scripts", () => {
    const evidence = pageEvidence(SHOP_PAGE);
    expect(evidence.nutriScores).toEqual(["B"]);
    expect(evidence.text).toContain('"weight":"350 g"');
    expect(evidence.text).toContain("Waarvan suikers | 5,2 g");
    expect(evidence.text).not.toContain("tracking");
    expect(worthReading(evidence)).toBe(true);
    expect(worthReading(pageEvidence("<title>Pindakaas</title><p>Bestel nu</p>"))).toBe(false);
  });
});

describe("guardFacts", () => {
  const evidence = pageEvidence(SHOP_PAGE);

  it("keeps what the page states", () => {
    expect(guardFacts(raw(), evidence, SOURCE)).toEqual({
      nutriScore: "B",
      per100: { unit: "g", energyKcal: 618, fat: 51.3, saturatedFat: 7.9, sugars: 5.2, fibre: 8.1, protein: 25.8, salt: 0.01 },
      ingredients: "Pinda's (100%).",
      allergens: ["pinda's"],
      claims: ["Zonder toegevoegd suiker", "Vegan"],
      quantity: "350 g",
      sourceUrl: SOURCE.url,
      sourceName: "ah.nl",
      readAt: 1,
    });
  });

  it("drops numbers, scores, claims and ingredients that are not on the page", () => {
    const facts = guardFacts(raw({ nutriScore: "A", sugars: 3.4, claims: ["Biologisch", "Vegan"], ingredients: "Pinda's, palmolie, suiker, zout", quantity: "600 g" }), evidence, SOURCE)!;
    expect(facts.nutriScore).toBe("B");
    expect(facts.per100?.sugars).toBeUndefined();
    expect(facts.per100?.fat).toBe(51.3);
    expect(facts.claims).toEqual(["Vegan"]);
    expect(facts.ingredients).toBeUndefined();
    expect(facts.quantity).toBeUndefined();
  });

  it("only accepts a number next to its own label, and keeps allergens and the Nutri-Score out of the claims", () => {
    const facts = guardFacts(raw({ salt: 11, energyKcal: 2563, claims: ["Nutri-Score B", "pinda's", "Vegan"] }), evidence, SOURCE)!;
    expect(facts.per100?.salt).toBeUndefined();
    expect(facts.per100?.energyKcal).toBeUndefined();
    expect(facts.per100?.sugars).toBe(5.2);
    expect(facts.claims).toEqual(["Vegan"]);
  });

  it("keeps the values of the same product in another pack, but not that pack's size", () => {
    const facts = guardFacts(raw({ samePack: false }), evidence, SOURCE)!;
    expect(facts.per100?.salt).toBe(0.01);
    expect(facts.ingredients).toBe("Pinda's (100%).");
    expect(facts.quantity).toBeUndefined();
  });

  it("returns nothing for another product or a page without facts", () => {
    expect(guardFacts(raw({ sameProduct: false }), evidence, SOURCE)).toBeNull();
    const empty = raw({ nutriScore: null, energyKcal: null, fat: null, saturatedFat: null, sugars: null, fibre: null, protein: null, salt: null, ingredients: null, allergens: [], claims: [] });
    expect(guardFacts(empty, pageEvidence("<p>Pindakaas 350 g kopen</p>"), SOURCE)).toBeNull();
  });
});
