import { expect, it } from "vitest";
import { canonicalEan, cleanEan, isValidEan, sameEan } from "./ean";
import { awardedStars, itemStars, starTotal } from "./scoring";
import type { AdventureItem } from "./types";

it("controleert het controlecijfer en houdt voorloopnullen", () => {
  expect(isValidEan("3017620422003")).toBe(true);
  expect(isValidEan("3017620422004")).toBe(false);
  expect(isValidEan("96385074")).toBe(true);
  expect(isValidEan("036000291452")).toBe(true);
  expect(isValidEan("12345")).toBe(false);
  expect(isValidEan("30176204220a3")).toBe(false);
  expect(canonicalEan("036000291452")).toBe("0036000291452");
  expect(canonicalEan("0036000291452")).toBe("0036000291452");
  expect(cleanEan(" 87 1234 ")).toBe("871234");
});

it("vergelijkt UPC-A en EAN-13 als dezelfde code", () => {
  expect(sameEan("036000291452", "0036000291452")).toBe(true);
  expect(sameEan("3017620422003", "3017620422003")).toBe(true);
  expect(sameEan("3017620422003", "8710400000006")).toBe(false);
  expect(sameEan(undefined, "3017620422003")).toBe(false);
});

it("zet een UPC-E-code om", () => {
  expect(isValidEan("04252614", "upc-e")).toBe(true);
  expect(canonicalEan("04252614", "upc-e")).toBe("0042100005264");
});

it("telt sterren per product, oude lijstjes tellen 1", () => {
  const base: AdventureItem = { id: "a", productId: "melk", name: "Melk", icon: "melk", category: "dairy", quantity: 1, status: "found" };
  expect(awardedStars()).toBe(1);
  expect(awardedStars("verified")).toBe(3);
  expect(awardedStars("confirmed")).toBe(3);
  expect(itemStars(base)).toBe(1);
  expect(itemStars({ ...base, stars: 3 })).toBe(3);
  expect(itemStars({ ...base, status: "pending", stars: 3 })).toBe(0);
  expect(starTotal([base, { ...base, id: "b", stars: 3 }, { ...base, id: "c", status: "skipped" }])).toBe(4);
});
