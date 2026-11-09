import { describe, expect, it } from "vitest";
import {
  shareIdFromPath,
  sharedListPageUrl,
  toImportSavedItems,
  toSharedList,
  type SharedListV1,
} from "./shareList";
import type { AdventureItem } from "./types";

const melk: AdventureItem = {
  id: "a",
  productId: "melk",
  name: "Melk",
  icon: "milk",
  category: "dairy",
  quantity: 2,
  status: "pending",
};

const hagelslag: AdventureItem = {
  id: "b",
  productId: "hagelslag",
  name: "Hagelslag",
  icon: "sprinkles",
  category: "breakfast",
  quantity: 1,
  status: "pending",
  brand: "De Ruijter",
  packageSize: "400 g",
  ean: "8710496978722",
  photoId: "local-photo",
  recognition: { confidence: "high", genericName: "hagelslag" },
  nutrition: { nutriscore: "D" },
  stars: 3,
};

const custom: AdventureItem = {
  id: "c",
  productId: "custom:cashewnoten",
  name: "Cashewnoten",
  icon: "unknown",
  category: "produce",
  quantity: 1,
  status: "pending",
  kind: "custom_generic",
};

describe("toSharedList", () => {
  it("keeps names, quantities, categories and strips private fields", () => {
    const list = toSharedList({ name: "Weekboodschappen", retailer: "albert_heijn", items: [melk, hagelslag] });
    expect(list).toMatchObject({
      version: 1,
      name: "Weekboodschappen",
      retailer: "albert_heijn",
      items: [
        { name: "Melk", quantity: 2, category: "dairy", productId: "melk" },
        { name: "Hagelslag", quantity: 1, category: "breakfast", productId: "hagelslag", brand: "De Ruijter", packageSize: "400 g", ean: "8710496978722" },
      ],
    });
    expect(JSON.stringify(list)).not.toMatch(/photoId|recognition|nutrition|stars/);
  });

  it("keeps Dutch and Unicode names and custom generics", () => {
    const fancy: AdventureItem = { ...melk, name: "Biologische volle melk 🥛", productId: "melk" };
    const list = toSharedList({ name: "Boodschappenlijst", items: [fancy, custom] });
    expect(list?.items[0].name).toContain("Biologische");
    expect(list?.items[1]).toMatchObject({ name: "Cashewnoten", kind: "custom_generic", productId: "custom:cashewnoten" });
    expect(list?.name).toBeUndefined();
  });

  it("drops unverified EAN candidates and unknown catalog ids", () => {
    const bad: AdventureItem = {
      ...melk,
      productId: "not-a-real-product",
      ean: "123",
      recognition: { confidence: "low", eanCandidate: "8710496978722" },
    };
    const list = toSharedList({ name: "x", items: [bad] });
    expect(list?.items[0].ean).toBeUndefined();
    expect(list?.items[0].productId).toBeUndefined();
  });
});

describe("short link helpers", () => {
  it("builds /l/{id} URLs and parses path ids", () => {
    expect(sharedListPageUrl("abcdefghijklmnop")).toBe("https://www.karrie.eu/l/abcdefghijklmnop");
    expect(shareIdFromPath("/l/abcdefghijklmnop")).toBe("abcdefghijklmnop");
    expect(shareIdFromPath("/l/abcdefghijklmnop/")).toBe("abcdefghijklmnop");
    expect(shareIdFromPath("/l/short")).toBeNull();
    expect(shareIdFromPath("/")).toBeNull();
  });
});

describe("import mapping", () => {
  it("creates local saved items without photos and with pending-ready fields", () => {
    const list: SharedListV1 = {
      version: 1,
      retailer: "lidl",
      items: [
        { name: "Melk", quantity: 2, category: "dairy", productId: "melk" },
        { name: "Hagelslag", quantity: 1, category: "breakfast", ean: "8710496978722", brand: "De Ruijter" },
      ],
    };
    const items = toImportSavedItems(list);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ productId: "melk", quantity: 2, imageKind: "generic", imageChoice: "drawing" });
    expect(items[1].ean).toBe("8710496978722");
    expect(items.every((item) => !("photoId" in item && item.photoId))).toBe(true);
  });
});
