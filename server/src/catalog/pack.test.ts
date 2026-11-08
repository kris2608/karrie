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

  it("summarises conflict until a parent note exists", () => {
    const conflict = summarizePack([
      { source: "openfoodfacts", quantityRaw: "220 ml", quantityMl: 220, retrievedAt: 1 },
      { source: "prijsprofeet", quantityRaw: "1 l", quantityMl: 1000, retrievedAt: 2 },
    ]);
    expect(conflict.conflict).toBe(true);
    expect(conflict.displayQuantity).toBeUndefined();

    const parent = summarizePack([
      ...conflict.sources,
      { source: "parent_unverified", quantityRaw: "1 l", quantityMl: 1000, retrievedAt: 3 },
    ]);
    expect(parent.conflict).toBe(false);
    expect(parent.displayQuantity).toBe("1 l");
  });
});
