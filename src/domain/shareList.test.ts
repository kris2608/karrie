import { describe, expect, it } from "vitest";
import {
  SHARE_LIST_MAX_ITEMS,
  sanitizeAnalyticsUrl,
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

function itemAt(index: number, quantity = 1): AdventureItem {
  return {
    id: `i${index}`,
    productId: "melk",
    name: `Product ${index}`,
    icon: "milk",
    category: "dairy",
    quantity,
    status: "pending",
  };
}

describe("toSharedList", () => {
  it("keeps names, quantities, categories and strips private fields", () => {
    const result = toSharedList({ name: "Weekboodschappen", retailer: "albert_heijn", items: [melk, hagelslag] });
    expect(result).toMatchObject({
      status: "ok",
      list: {
        version: 1,
        name: "Weekboodschappen",
        retailer: "albert_heijn",
        items: [
          { name: "Melk", quantity: 2, category: "dairy", productId: "melk" },
          { name: "Hagelslag", quantity: 1, category: "breakfast", productId: "hagelslag", brand: "De Ruijter", packageSize: "400 g", ean: "8710496978722" },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/photoId|recognition|nutrition|stars/);
  });

  it("keeps Dutch and Unicode names and custom generics", () => {
    const fancy: AdventureItem = { ...melk, name: "Biologische volle melk 🥛", productId: "melk" };
    const result = toSharedList({ name: "Boodschappenlijst", items: [fancy, custom] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.list.items[0].name).toContain("Biologische");
    expect(result.list.items[1]).toMatchObject({ name: "Cashewnoten", kind: "custom_generic", productId: "custom:cashewnoten" });
    expect(result.list.name).toBeUndefined();
  });

  it("drops unverified EAN candidates and unknown catalog ids without rejecting the row", () => {
    const bad: AdventureItem = {
      ...melk,
      productId: "not-a-real-product",
      ean: "123",
      recognition: { confidence: "low", eanCandidate: "8710496978722" },
    };
    const result = toSharedList({ name: "x", items: [bad] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.list.items[0].ean).toBeUndefined();
    expect(result.list.items[0].productId).toBeUndefined();
  });

  it("rejects empty lists and invalid product fields", () => {
    expect(toSharedList({ name: "x", items: [] })).toEqual({ status: "error", code: "empty" });
    expect(toSharedList({ name: "x", items: [{ ...melk, name: "" }] })).toEqual({ status: "error", code: "invalid" });
    expect(toSharedList({ name: "x", items: [{ ...melk, category: "nope" as AdventureItem["category"] }] })).toEqual({
      status: "error",
      code: "invalid",
    });
    expect(toSharedList({ name: "x", items: [{ ...melk, quantity: 0 }] })).toEqual({ status: "error", code: "invalid" });
  });

  it("preserves order and quantities for 1, 40, 41, 60 and 100 products", () => {
    for (const count of [1, 40, 41, 60, SHARE_LIST_MAX_ITEMS]) {
      const items = Array.from({ length: count }, (_, index) => itemAt(index, (index % 24) + 1));
      const result = toSharedList({ name: "Groot", items });
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      expect(result.list.items).toHaveLength(count);
      expect(result.list.items.map((item) => item.name)).toEqual(items.map((item) => item.name));
      expect(result.list.items.map((item) => item.quantity)).toEqual(items.map((item) => item.quantity));
    }
  });

  it("rejects lists above the validated maximum without truncating", () => {
    const items = Array.from({ length: SHARE_LIST_MAX_ITEMS + 1 }, (_, index) => itemAt(index));
    expect(toSharedList({ name: "Te groot", items })).toEqual({ status: "error", code: "too-many" });
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

  it("redacts share tokens from analytics URLs", () => {
    expect(sanitizeAnalyticsUrl("/l/abcdefghijklmnop")).toBe("/l");
    expect(sanitizeAnalyticsUrl("https://www.karrie.eu/l/abcdefghijklmnop?x=1#y")).toBe("/l");
    expect(sanitizeAnalyticsUrl("/toevoegen")).toBe("/toevoegen");
    expect(sanitizeAnalyticsUrl("/controleren?tab=1")).toBe("/controleren?tab=1");
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

  it("imports a complete 100-product snapshot", () => {
    const list: SharedListV1 = {
      version: 1,
      items: Array.from({ length: 100 }, (_, index) => ({
        name: `Product ${index}`,
        quantity: (index % 24) + 1,
        category: "dairy" as const,
        productId: "melk",
      })),
    };
    const items = toImportSavedItems(list);
    expect(items).toHaveLength(100);
    expect(items[99]).toMatchObject({ name: "Product 99", quantity: 4 });
  });
});
