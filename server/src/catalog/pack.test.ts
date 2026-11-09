import { describe, expect, it } from "vitest";
import { formatPackChoice, packsConflict, quantityMlOf, summarizePack } from "./pack.js";

describe("pack quantity normalize", () => {
  it("treats 1 l and 1000 ml as the same volume", () => {
    expect(quantityMlOf("1 l")).toBe(1000);
    expect(quantityMlOf("1 liter")).toBe(1000);
    expect(quantityMlOf("1000 ml")).toBe(1000);
    expect(packsConflict(quantityMlOf("1 l"), quantityMlOf("1000 ml"))).toBe(false);
  });

  it("flags Campina 220 ml vs 1 l", () => {
    expect(packsConflict(quantityMlOf("220 ml"), quantityMlOf("1 l"), "220 ml", "1 l")).toBe(true);
    expect(formatPackChoice("1 l")).toBe("1 liter");
    expect(formatPackChoice("220 ml")).toBe("220 ml");
  });

  it("lets PrijsProfeet win over Open Food Facts without asking the parent", () => {
    const pack = summarizePack([
      { source: "openfoodfacts", quantityRaw: "220 ml", quantityMl: 220, retrievedAt: 1 },
      { source: "prijsprofeet", retailer: "jumbo", quantityRaw: "1 l", quantityMl: 1000, retrievedAt: 2 },
    ]);
    expect(pack.conflict).toBe(false);
    expect(pack.displayQuantity).toBe("1 l");
  });

  it("uses the PrijsProfeet majority and prefers the list retailer on a tie", () => {
    const pack = summarizePack(
      [
        { source: "prijsprofeet", retailer: "plus", quantityRaw: "125 g", quantityMl: 125, retrievedAt: 1 },
        { source: "prijsprofeet", retailer: "dirk", quantityRaw: "125 g", quantityMl: 125, retrievedAt: 2 },
        { source: "prijsprofeet", retailer: "jumbo", quantityRaw: "250 g", quantityMl: 250, retrievedAt: 3 },
        { source: "openfoodfacts", quantityRaw: "100 g", quantityMl: 100, retrievedAt: 4 },
      ],
      "albert_heijn",
    );
    expect(pack.conflict).toBe(false);
    expect(pack.displayQuantity).toBe("125 g");

    const tied = summarizePack(
      [
        { source: "prijsprofeet", retailer: "plus", quantityRaw: "1 l", quantityMl: 1000, retrievedAt: 1 },
        { source: "prijsprofeet", retailer: "albert_heijn", quantityRaw: "1.5 l", quantityMl: 1500, retrievedAt: 2 },
      ],
      "albert_heijn",
    );
    expect(tied.conflict).toBe(false);
    expect(tied.displayQuantity).toBe("1.5 l");
  });

  it("asks the parent only when PrijsProfeet retailers disagree without a majority", () => {
    const conflict = summarizePack([
      { source: "prijsprofeet", retailer: "plus", quantityRaw: "1 l", quantityMl: 1000, retrievedAt: 1 },
      { source: "prijsprofeet", retailer: "dirk", quantityRaw: "1.5 l", quantityMl: 1500, retrievedAt: 2 },
      { source: "openfoodfacts", quantityRaw: "220 ml", quantityMl: 220, retrievedAt: 3 },
    ]);
    expect(conflict.conflict).toBe(true);
    expect(conflict.displayQuantity).toBeUndefined();

    const parent = summarizePack([
      ...conflict.sources,
      { source: "parent_unverified", quantityRaw: "1 l", quantityMl: 1000, retrievedAt: 4 },
    ]);
    expect(parent.conflict).toBe(false);
    expect(parent.displayQuantity).toBe("1 l");
  });
});
