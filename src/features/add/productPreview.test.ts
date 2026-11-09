import { describe, expect, it } from "vitest";
import type { AdventureItem, Product, SavedItem } from "../../domain/types";
import { infoCorner, previewCategory, previewMine, previewName, previewPack, previewQuantity, tileGesture } from "./productPreview";

const milk: Product = {
  id: "milk",
  name: "Melk",
  category: "dairy",
  groupId: "milk",
  aliases: [],
};

const listed: AdventureItem = {
  id: "line-1",
  productId: "milk",
  name: "Melk",
  icon: "milk",
  category: "dairy",
  quantity: 2,
  status: "pending",
  brand: "Campina",
  packageSize: "1 l",
};

const mineEntry: SavedItem = {
  productId: "custom:boterhamworst",
  name: "Boterhamworst",
  icon: "unknown",
  category: "meat",
  quantity: 1,
  brand: "Unox",
  packageSize: "250 g",
};

describe("tile gestures", () => {
  it("keeps tap-add, info preview, and long-press remove on separate paths", () => {
    expect(tileGesture("add")).toBe("add");
    expect(tileGesture("info")).toBe("preview");
    expect(tileGesture("long-press")).toBe("remove");
  });
});

describe("infoCorner", () => {
  it("sits top-trailing when there is no quantity badge, bottom-leading when there is", () => {
    expect(infoCorner(0)).toBe("top-trailing");
    expect(infoCorner(3)).toBe("bottom-leading");
  });
});

describe("preview helpers", () => {
  it("builds a short catalog preview without inventing pack facts", () => {
    const target = { kind: "catalog" as const, product: milk, quantity: 0 };
    expect(previewName(target)).toBe("Melk");
    expect(previewCategory(target)).toBe("dairy");
    expect(previewQuantity(target)).toBe(0);
    expect(previewMine(target)).toBe(false);
    expect(previewPack(target)).toEqual({ name: "Melk", productId: "milk", category: "dairy", icon: "milk" });
  });

  it("prefers the listed pack when the catalog tile is already on the list", () => {
    const target = { kind: "catalog" as const, product: milk, listed, quantity: 3 };
    expect(previewQuantity(target)).toBe(3);
    expect(previewPack(target)).toBe(listed);
  });

  it("shows Mijn producten with remembered pack details", () => {
    const target = { kind: "mine" as const, entry: mineEntry, quantity: 1 };
    expect(previewName(target)).toBe("Boterhamworst");
    expect(previewMine(target)).toBe(true);
    expect(previewPack(target)).toBe(mineEntry);
  });

  it("keeps extras on their listed item", () => {
    const target = { kind: "extra" as const, item: listed, quantity: 2 };
    expect(previewName(target)).toBe("Melk");
    expect(previewPack(target)).toBe(listed);
    expect(previewQuantity(target)).toBe(2);
  });
});
