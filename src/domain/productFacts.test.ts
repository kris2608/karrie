import { describe, expect, it } from "vitest";
import { displayFacts, packFactsFromItem, type ProductFacts } from "./productFacts";

const BARCODE = {
  status: "off-exact" as const,
  sourceName: "Open Food Facts",
  sourceUrl: "https://world.openfoodfacts.org/product/8720182255563",
  at: 1,
};

const PAGE: ProductFacts = {
  nutriScore: "B",
  per100: { unit: "g", sugars: 1 },
  ingredients: "uit de winkelpagina",
  claims: ["vegetarisch"],
  sourceUrl: "https://www.jumbo.com/producten/x",
  sourceName: "Jumbo",
  readAt: 2,
};

describe("packFactsFromItem", () => {
  it("maps OFF pack nutrition and ingredients with barcode source", () => {
    expect(
      packFactsFromItem({
        barcode: BARCODE,
        packageSize: "250 ml",
        ingredients: "plantaardige oliën, knoflook",
        nutrition: { nutriscore: "c", energyKcal100g: 252, sugars100g: 9.4, saturatedFat100g: 1.9, salt100g: 1.7 },
      }),
    ).toEqual({
      nutriScore: "C",
      per100: { unit: "g", energyKcal: 252, sugars: 9.4, saturatedFat: 1.9, salt: 1.7 },
      ingredients: "plantaardige oliën, knoflook",
      quantity: "250 ml",
      sourceUrl: BARCODE.sourceUrl,
      sourceName: "Open Food Facts",
      readAt: 1,
    });
  });

  it("returns undefined without a barcode source or usable pack fields", () => {
    expect(packFactsFromItem({ nutrition: { nutriscore: "c" } })).toBeUndefined();
    expect(packFactsFromItem({ barcode: BARCODE })).toBeUndefined();
  });
});

describe("displayFacts", () => {
  it("prefers shop-page facts and falls back to the pack", () => {
    const item = {
      name: "Knoflooksaus",
      brand: "Calvé",
      barcode: BARCODE,
      ingredients: "plantaardige oliën, knoflook",
      nutrition: { nutriscore: "c", sugars100g: 9.4 },
    };
    expect(displayFacts(item, PAGE)).toBe(PAGE);
    expect(displayFacts(item, undefined)?.ingredients).toBe("plantaardige oliën, knoflook");
    expect(displayFacts(item, undefined)?.sourceName).toBe("Open Food Facts");
  });
});
