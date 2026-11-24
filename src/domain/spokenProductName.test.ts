import { describe, expect, it } from "vitest";
import { spokenNameInSentence, spokenProductName } from "./spokenProductName";

describe("spokenProductName", () => {
  it("uses the catalog name for known product ids", () => {
    expect(spokenProductName({ productId: "banaan", name: "Jumbo Bananen 5 stuks" })).toBe("Banaan");
    expect(spokenProductName({ productId: "melk", name: "AH Halfvolle melk 1 liter", brand: "AH" })).toBe("Melk");
  });

  it("strips brand and pack size from scanned titles", () => {
    expect(
      spokenProductName({
        productId: "photo:1",
        name: "Calvé Pindakaas 650 gram",
        brand: "Calvé",
        packageSize: "650 g",
      }),
    ).toBe("Pindakaas");
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

  it("lowercases names inside sentences", () => {
    expect(spokenNameInSentence("Bananen")).toBe("bananen");
    expect(spokenNameInSentence("Melk")).toBe("melk");
  });
});
