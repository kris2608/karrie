import { describe, expect, it } from "vitest";
import { productById } from "../data/catalog";
import { packFromVision } from "../data/sample";
import { houseBrandRetailer } from "../domain/retailers";
import { nameImageLookupKey, parseNameImageLookupKey } from "../domain/imageIdentity";
import { initialState, reducer } from "./reducer";

const hagelslag = productById("hagelslag") ?? productById("chocoladehagel") ?? productById("melk")!;

function listWith(retailer: "albert_heijn" | "jumbo" | "lidl") {
  let state = reducer(initialState, { type: "add-product", product: hagelslag });
  return reducer(state, { type: "set-retailer", retailer });
}

describe("switching supermarket preserves product identity", () => {
  it("keeps generic hagelslag when AH → Jumbo", () => {
    const ah = listWith("albert_heijn");
    const before = ah.adventure!.items[0];
    const jumbo = reducer(ah, { type: "set-retailer", retailer: "jumbo" });
    expect(jumbo.adventure?.retailer).toBe("jumbo");
    expect(jumbo.adventure?.items[0]).toEqual(before);
    expect(jumbo.settings).not.toHaveProperty("retailer");
  });

  it("keeps an explicitly adopted AH private label when switching to Jumbo", () => {
    let state = listWith("albert_heijn");
    const id = state.adventure!.items[0].id;
    state = reducer(state, {
      type: "adopt-commercial",
      itemId: id,
      name: "AH Hagelslag Melk",
      brand: "AH",
      privateLabelRetailer: "albert_heijn",
      photo: {
        source: "prijsprofeet",
        imageUrl: "https://static.ah.nl/dam/product/AHI_x?rendition=800x800_WEBP&fileType=binary",
        productName: "AH Hagelslag Melk",
        retailer: "albert_heijn",
      },
    });
    const jumbo = reducer(state, { type: "set-retailer", retailer: "jumbo" });
    const item = jumbo.adventure!.items[0];
    expect(item.name).toBe("AH Hagelslag Melk");
    expect(item.privateLabelRetailer).toBe("albert_heijn");
    expect(item.namePhoto?.retailer).toBe("albert_heijn");
    expect(item.ean).toBeUndefined();
  });

  it("does not substitute an EAN when the supermarket changes", () => {
    let state = listWith("albert_heijn");
    const id = state.adventure!.items[0].id;
    state = reducer(state, {
      type: "apply-recognition",
      itemId: id,
      pack: { ean: "8718166031753", brand: "Melkunie", recognition: { specific: true, genericName: "vla", confidence: "high" } },
    });
    const ean = state.adventure!.items[0].ean;
    const jumbo = reducer(state, { type: "set-retailer", retailer: "jumbo" });
    expect(jumbo.adventure!.items[0].ean).toBe(ean);
  });

  it("keeps a parent photo after switching", () => {
    let state = listWith("albert_heijn");
    const id = state.adventure!.items[0].id;
    state = reducer(state, {
      type: "apply-recognition",
      itemId: id,
      photoId: "parent-1",
      pack: { brand: "Pepsi", recognition: { specific: true, genericName: "cola", confidence: "high" } },
    });
    state = reducer(state, { type: "set-image-choice", itemId: id, choice: "photo" });
    const jumbo = reducer(state, { type: "set-retailer", retailer: "jumbo" });
    expect(jumbo.adventure!.items[0].photoId).toBe("parent-1");
    expect(jumbo.adventure!.items[0].imageSource).toBe("parent");
    expect(jumbo.adventure!.items[0].imageChoice).toBe("photo");
  });

  it("changing the default supermarket does not mutate an active list", () => {
    const state = reducer(listWith("jumbo"), { type: "set-default-retailer", retailer: "lidl" });
    expect(state.adventure?.retailer).toBe("jumbo");
    expect(state.settings.retailer).toBe("lidl");
  });
});

describe("device cache keys for private-label suggestions", () => {
  it("isolates retailers and parses lookup keys", () => {
    expect(nameImageLookupKey("Hagelslag", "albert_heijn")).toBe("hagelslag|r|albert_heijn");
    expect(nameImageLookupKey("Hagelslag", "jumbo")).toBe("hagelslag|r|jumbo");
    expect(parseNameImageLookupKey("hagelslag|r|jumbo")).toEqual({ name: "hagelslag", retailer: "jumbo" });
    expect(parseNameImageLookupKey("pepsi")).toEqual({ name: "pepsi" });
  });
});

describe("observed private labels from photo recognition", () => {
  it("marks an AH pack without remapping to the list supermarket", () => {
    expect(houseBrandRetailer("AH", "hagelslag")).toBe("albert_heijn");
    const pack = packFromVision({ brand: "AH", recognition: { specific: true, genericName: "hagelslag", confidence: "high" } });
    expect(pack.privateLabelRetailer).toBe("albert_heijn");
    expect(pack.brand).toBe("AH");
  });

  it("leaves manufacturer brands without a privateLabelRetailer", () => {
    expect(houseBrandRetailer("Pepsi")).toBeUndefined();
    expect(packFromVision({ brand: "Pepsi", recognition: { specific: true, genericName: "cola", confidence: "high" } })).not.toHaveProperty("privateLabelRetailer");
  });
});
