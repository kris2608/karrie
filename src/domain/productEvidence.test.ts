import { describe, expect, it } from "vitest";
import { assembleProductEvidence, isAssessable, isBareGeneric } from "./productEvidence";
import type { AdventureItem } from "./types";

function item(partial: Partial<AdventureItem> & Pick<AdventureItem, "name">): AdventureItem {
  return {
    id: "i1",
    productId: "pindakaas",
    icon: "pindakaas",
    category: "pantry",
    quantity: 1,
    status: "pending",
    ...partial,
  };
}

describe("assembleProductEvidence", () => {
  it("prefers OFF ingredients and marks exact barcode matches", () => {
    const evidence = assembleProductEvidence(
      item({
        name: "Pindakaas",
        brand: "Calvé",
        ean: "8715700112345",
        ingredients: "Pinda's, suiker, zout",
        nutrition: { sugars100g: 8, salt100g: 1 },
        barcode: { status: "off-exact", sourceName: "Open Food Facts", sourceUrl: "https://world.openfoodfacts.org", at: 1 },
      }),
    );
    expect(evidence.ingredientsSource).toBe("off");
    expect(evidence.nutritionSource).toBe("off");
    expect(evidence.matchConfidence).toBe("exact");
    expect(isAssessable(evidence)).toBe(true);
  });

  it("uses page facts when OFF ingredients are missing", () => {
    const evidence = assembleProductEvidence(item({ name: "Pindakaas", brand: "Calvé" }), {
      ingredients: "Pinda's, zout",
      sourceUrl: "https://example.com/p",
      sourceName: "Shop",
      readAt: 1,
    });
    expect(evidence.ingredientsSource).toBe("page");
    expect(evidence.matchConfidence).toBe("likely");
  });

  it("treats bare catalog generics as weak and not assessable", () => {
    expect(isBareGeneric(item({ name: "Pindakaas", productId: "pindakaas" }))).toBe(true);
    const evidence = assembleProductEvidence(item({ name: "Melk", productId: "melk" }));
    expect(evidence.matchConfidence).toBe("weak");
    expect(isAssessable(evidence)).toBe(false);
  });
});
