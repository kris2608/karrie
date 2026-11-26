import { describe, expect, it } from "vitest";
import { spokenNameInSentence, spokenNounPhrase, spokenProductMeta, spokenProductName } from "./spokenProductName";

describe("spokenProductName", () => {
  it("uses the catalog name for known product ids", () => {
    expect(spokenProductName({ productId: "banaan", name: "Jumbo Bananen 5 stuks" })).toBe("banaan");
    expect(spokenProductName({ productId: "melk", name: "AH Halfvolle melk 1 liter", brand: "AH" })).toBe("melk");
  });

  it("strips brand and pack size from scanned titles", () => {
    expect(
      spokenProductName({
        productId: "photo:1",
        name: "Calvé Pindakaas 650 gram",
        brand: "Calvé",
        packageSize: "650 g",
      }),
    ).toBe("pindakaas");
  });

  it("keeps meaningful distinctions like chocolate milk", () => {
    expect(
      spokenProductName({
        productId: "photo:choco",
        name: "Chocolademelk",
        brand: "Chocomel",
      }),
    ).toMatch(/chocolademelk/i);
  });

  it("uses de/het and singular mass for the phrases that used to sound wrong", () => {
    expect(spokenProductMeta({ productId: "photo:mais", name: "Mais" })).toMatchObject({ article: "de", number: "mass" });
    expect(spokenNounPhrase({ productId: "photo:croissant", name: "Croissant" }, { withArticle: true })).toBe("de croissant");
    expect(spokenNounPhrase({ productId: "photo:pak", name: "Drinkpakje" }, { withArticle: true })).toBe("het drinkpakje");
    expect(spokenNounPhrase({ productId: "photo:ui", name: "Ui" }, { withArticle: true })).toBe("de ui");
  });

  it("lowercases names inside sentences", () => {
    expect(spokenNameInSentence("Bananen")).toBe("bananen");
    expect(spokenNameInSentence("Melk")).toBe("melk");
  });
});
