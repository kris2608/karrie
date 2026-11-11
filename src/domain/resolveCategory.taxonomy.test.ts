import { describe, expect, it } from "vitest";
import { productById } from "../data/catalog";
import { mergeCategoryOrder, orderForRetailer } from "./categories";
import { resolveCategory } from "./resolveCategory";

describe("supermarket category taxonomy", () => {
  it("classifies cheese, ham, chips, care and ontbijtkoek into the refined departments", () => {
    expect(productById("kaas")?.category).toBe("deli");
    expect(productById("ham")?.category).toBe("deli");
    expect(productById("chips")?.category).toBe("snacks");
    expect(productById("chocoladereep")?.category).toBe("snacks");
    expect(productById("ontbijtkoek")?.category).toBe("breakfast");
    expect(productById("shampoo")?.category).toBe("care");
    expect(productById("afwasmiddel")?.category).toBe("household");
    expect(productById("maaltijdsalade")?.category).toBe("meals");
    expect(resolveCategory({ name: "De Ruijter hagelslag" })).toBe("breakfast");
    expect(resolveCategory({ name: "Magnum chocoladereep" })).toBe("snacks");
    expect(resolveCategory({ tags: ["kaas"] })).toBe("deli");
    expect(resolveCategory({ tags: ["snoep-koek-chips"] })).toBe("snacks");
    expect(resolveCategory({ tags: ["drogisterij"] })).toBe("care");
  });

  it("locks any stored category order to the shared walk order", () => {
    expect(mergeCategoryOrder(["produce", "dairy", "household"])).toEqual([
      "produce",
      "meals",
      "meat",
      "deli",
      "bakery",
      "breakfast",
      "dairy",
      "pantry",
      "snacks",
      "household",
      "care",
      "drinks",
      "frozen",
    ]);
  });

  it("uses the same walk order for every retailer", () => {
    const ah = orderForRetailer("albert_heijn");
    const jumbo = orderForRetailer("jumbo");
    const lidl = orderForRetailer("lidl");
    expect(new Set(ah).size).toBe(ah.length);
    expect(ah).toEqual(expect.arrayContaining(["deli", "snacks", "meals", "care"]));
    expect(jumbo).toEqual(ah);
    expect(lidl).toEqual(ah);
  });

  it("places Olvarit baby meals in pantry, not produce", () => {
    expect(resolveCategory({ name: "Olvarit spinazie kip aardappel" })).toBe("pantry");
    expect(resolveCategory({ name: "Babyvoeding wortel" })).toBe("pantry");
  });
});
