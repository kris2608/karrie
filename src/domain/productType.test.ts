import { expect, it } from "vitest";
import { ART } from "../components/art";
import { productById } from "../data/catalog";
import { CATEGORY_ICONS } from "./categoryIcon";
import { mapCategory, matchesItemType, matchType, TYPE_RULE_PRODUCT_IDS } from "./productType";

const PEANUT_BUTTER = { categoryTags: ["en:plant-based-foods", "en:spreads", "en:nut-butters", "en:peanut-butters"] };
const NUTELLA = { categoryTags: ["en:breakfasts", "en:spreads", "en:sweet-spreads", "en:hazelnut-spreads"] };

it("koppelt alleen aan bestaande catalogusproducten en tekeningen", () => {
  expect(TYPE_RULE_PRODUCT_IDS.filter((id) => !productById(id))).toEqual([]);
  expect(Object.values(CATEGORY_ICONS).filter((id) => id !== "pakket" && !ART[id])).toEqual([]);
});

it("herkent pindakaas maar niet hazelnootpasta", () => {
  expect(matchesItemType(PEANUT_BUTTER, "pindakaas")).toBe(true);
  expect(matchesItemType(NUTELLA, "pindakaas")).toBe(false);
  expect(matchesItemType({ categoryTags: [] }, "pindakaas")).toBe(false);
  expect(matchesItemType(PEANUT_BUTTER, "ean:8710400000006")).toBe(false);
  expect(matchType(PEANUT_BUTTER)?.id).toBe("pindakaas");
  expect(matchType(NUTELLA)).toBeNull();
});

it("laat volkorenbrood ook gelden voor gewoon brood", () => {
  const bread = { categoryTags: ["en:cereals-and-potatoes", "en:breads", "en:wholemeal-breads"] };
  expect(matchType(bread)?.id).toBe("volkorenbrood");
  expect(matchesItemType(bread, "brood")).toBe(true);
  expect(matchesItemType(bread, "kaas")).toBe(false);
});

it("kiest een categorie voorzichtig", () => {
  expect(mapCategory(PEANUT_BUTTER.categoryTags)).toBe("pantry");
  expect(mapCategory(["en:dairies", "en:milks"])).toBe("dairy");
  expect(mapCategory(["en:frozen-foods", "en:pizzas"])).toBe("frozen");
  expect(mapCategory(["en:snacks"])).toBe("pantry");
});
