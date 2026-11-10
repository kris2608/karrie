import { describe, expect, it } from "vitest";
import { identityOf, wantsStoreImage } from "./imageIdentity";
import {
  SHARE_LIST_MAX_ITEMS,
  isShareableProductId,
  normalizeSharedImageChoice,
  sanitizeAnalyticsUrl,
  shareIdFromPath,
  sharedListPageUrl,
  toImportSavedItems,
  toSharedList,
  type SharedListV1,
} from "./shareList";
import type { AdventureItem } from "./types";
import { pickArt } from "../components/ItemArt";

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

  it("drops unverified EAN candidates and local-only ids without rejecting the row", () => {
    const bad: AdventureItem = {
      ...melk,
      productId: "photo:abc",
      ean: "123",
      recognition: { confidence: "low", eanCandidate: "8710496978722" },
    };
    const result = toSharedList({ name: "x", items: [bad] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.list.items[0].ean).toBeUndefined();
    expect(result.list.items[0].productId).toBeUndefined();
  });

  it("keeps central catalog id shapes and strips photo/shared/UUID ids", () => {
    expect(isShareableProductId("melk")).toBe(true);
    expect(isShareableProductId("b-abc123")).toBe(true);
    expect(isShareableProductId("n-deadbeef")).toBe(true);
    expect(isShareableProductId("custom:cashew")).toBe(true);
    expect(isShareableProductId("photo:local")).toBe(false);
    expect(isShareableProductId("shared:dairy:melk")).toBe(false);
    expect(isShareableProductId("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
    const shared = toSharedList({
      name: "x",
      items: [{ ...hagelslag, productId: "b-calve123", recognition: { confidence: "high", variant: "naturel" } }],
    });
    expect(shared.status).toBe("ok");
    if (shared.status !== "ok") return;
    expect(shared.list.items[0]).toMatchObject({ productId: "b-calve123", variant: "naturel", ean: "8710496978722" });
    expect(JSON.stringify(shared)).not.toMatch(/photoId/);
  });

  it("S3: share prefers catalogProductId over bundled productId and never sends photoId", () => {
    const result = toSharedList({
      name: "Delen",
      items: [
        {
          ...hagelslag,
          productId: "hagelslag",
          catalogProductId: "b-deruijter99",
          catalogVariantId: "aabbccddeeff001122334455",
          icon: "hagelslag",
        },
      ],
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.list.items[0]).toMatchObject({ productId: "b-deruijter99", ean: "8710496978722", brand: "De Ruijter" });
    expect(JSON.stringify(result)).not.toMatch(/photoId|catalogVariantId|local-photo/);
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
  it("builds /s/{id} share URLs and parses /l and /s path ids", () => {
    expect(sharedListPageUrl("abcdefghijklmnop")).toBe("https://www.karrie.eu/s/abcdefghijklmnop");
    expect(shareIdFromPath("/l/abcdefghijklmnop")).toBe("abcdefghijklmnop");
    expect(shareIdFromPath("/s/abcdefghijklmnop/")).toBe("abcdefghijklmnop");
    expect(shareIdFromPath("/l/short")).toBeNull();
    expect(shareIdFromPath("/")).toBeNull();
  });

  it("redacts share tokens from analytics URLs", () => {
    expect(sanitizeAnalyticsUrl("/l/abcdefghijklmnop")).toBe("/l");
    expect(sanitizeAnalyticsUrl("/s/abcdefghijklmnop")).toBe("/s");
    expect(sanitizeAnalyticsUrl("https://www.karrie.eu/l/abcdefghijklmnop?x=1#y")).toBe("/l");
    expect(sanitizeAnalyticsUrl("/toevoegen")).toBe("/toevoegen");
    expect(sanitizeAnalyticsUrl("/controleren?tab=1")).toBe("/controleren?tab=1");
  });
});

describe("import mapping", () => {
  it("keeps generics on drawings and unlocks commercial identity for EAN/brand items", () => {
    const list: SharedListV1 = {
      version: 1,
      retailer: "lidl",
      items: [
        { name: "Melk", quantity: 2, category: "dairy", productId: "melk" },
        { name: "Hagelslag", quantity: 1, category: "breakfast", ean: "8710496978722", brand: "De Ruijter" },
        { name: "Chocomel Vol", quantity: 1, category: "drinks", brand: "Chocomel", variant: "vol" },
        { name: "Banaan", quantity: 1, category: "produce", productId: "banaan" },
      ],
    };
    const items = toImportSavedItems(list);
    expect(items[0]).toMatchObject({ productId: "melk", imageChoice: "drawing" });
    expect(items[1]).toMatchObject({ ean: "8710496978722", brand: "De Ruijter", source: "barcode" });
    expect(items[1].imageChoice).toBeUndefined();
    expect(wantsStoreImage(items[1])).toBe(true);
    expect(identityOf(items[1])?.generic).toBe(false);
    expect(items[2]).toMatchObject({ brand: "Chocomel", source: "shared", recognition: { variant: "vol" } });
    expect(identityOf(items[2])?.generic).toBe(false);
    expect(items[3]).toMatchObject({ productId: "banaan", imageChoice: "drawing" });
    expect(items.every((item) => !item.photoId)).toBe(true);
    expect(pickArt(items[1].imageChoice, { prijsprofeet: "https://cdn.example/hagel.jpg" })).toEqual({
      source: "prijsprofeet",
      url: "https://cdn.example/hagel.jpg",
    });
    expect(pickArt(items[0].imageChoice, { prijsprofeet: "https://cdn.example/x.jpg" })).toBeNull();
  });

  it("repairs legacy drawing locks when an EAN or brand is present", () => {
    const legacy = normalizeSharedImageChoice({
      name: "Hagelslag",
      ean: "8710496978722",
      brand: "De Ruijter",
      imageChoice: "drawing" as const,
      source: undefined,
    });
    expect(legacy.imageChoice).toBeUndefined();
    expect(legacy.source).toBe("barcode");
    expect(normalizeSharedImageChoice({ name: "Melk", imageChoice: "drawing" as const, source: undefined }).imageChoice).toBe("drawing");
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
