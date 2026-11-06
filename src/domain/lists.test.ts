import { expect, it } from "vitest";
import { ART } from "../components/art";
import { BESPOKE_IDS } from "../components/ProductArt";
import { products } from "../data/catalog";
import { createSampleAdventure } from "../data/sample";
import { matchProduct } from "./matchProduct";
import { parseList } from "./parseList";
import { activeItem, isComplete, markFound, skipItem, sortByCategory } from "./shopQueue";
import type { AdventureItem } from "./types";

function item(partial: Pick<AdventureItem, "id" | "category"> & Partial<AdventureItem>): AdventureItem {
  return {
    productId: partial.id,
    name: partial.id,
    icon: partial.id,
    quantity: 1,
    status: "pending",
    ...partial,
  };
}

it("heeft een catalogus van minstens 80 unieke producten", () => {
  expect(products.length).toBeGreaterThanOrEqual(80);
  expect(new Set(products.map((product) => product.id)).size).toBe(products.length);
  expect(products.filter((product) => !ART[product.id]).map((product) => product.id)).toEqual([]);
  expect(BESPOKE_IDS).toHaveLength(16);
  expect(BESPOKE_IDS.filter((id) => !products.some((product) => product.id === id))).toEqual([]);
});

it("splitst een geplakte lijst in hoeveelheid en naam", () => {
  const parsed = parseList("2x melk\nbrood\n- 3 appels\nmelk x2\n1 liter melk, 500g kaas");
  expect(parsed.map((chunk) => [chunk.quantity, chunk.query])).toEqual([
    [2, "melk"],
    [1, "brood"],
    [3, "appels"],
    [2, "melk"],
    [1, "melk"],
    [1, "kaas"],
  ]);
});

it("herkent producten, meervoud en een tikfout", () => {
  expect(matchProduct("appels", products)?.id).toBe("appel");
  expect(matchProduct("meik", products)?.id).toBe("melk");
  expect(matchProduct("pindakaas", products)?.id).toBe("pindakaas");
  expect(matchProduct("kaas", products)?.id).toBe("kaas");
  expect(matchProduct("xyz", products)).toBeNull();
});

it("sorteert de voorbeeldlijst op winkelvolgorde", () => {
  const adventure = createSampleAdventure();
  expect(adventure.items.map((entry) => entry.productId)).toEqual(["appel", "banaan", "brood", "melk"]);
});

it("vinkt af, slaat over en rondt af", () => {
  const items = [
    item({ id: "a", category: "produce" }),
    item({ id: "b", category: "bakery" }),
    item({ id: "c", category: "dairy" }),
  ];
  const found = markFound(items, "a");
  expect(activeItem(found)?.id).toBe("b");
  const skipped = skipItem(found, "b");
  expect(skipped.map((entry) => entry.id)).toEqual(["a", "c", "b"]);
  expect(skipped.at(-1)?.status).toBe("skipped");
  expect(skipItem([found[0]], found[0].id)).toEqual([found[0]]);
  const done = markFound(markFound(found, "b"), "c");
  expect(isComplete(done)).toBe(true);
  expect(sortByCategory(items, ["dairy", "produce", "bakery"]).map((entry) => entry.id)).toEqual(["c", "a", "b"]);
});
