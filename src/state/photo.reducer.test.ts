import { describe, expect, it } from "vitest";
import { productById } from "../data/catalog";
import type { VisionPack } from "../data/sample";
import { starTotal } from "../domain/scoring";
import { activeItem } from "../domain/shopQueue";
import type { Adventure, ScannedProduct } from "../domain/types";
import { referencedPhotos } from "../storage/photos";
import { initialState, reducer, type AppState } from "./reducer";

const TERRA: VisionPack = {
  brand: "AH Terra",
  recognition: { genericName: "Pindakaas", variant: "Naturel", subcategory: "pindakaas", claims: ["100% pindakaas"], nutriScoreSeen: "A", confidence: "high" },
};

const CALVE: ScannedProduct = {
  ean: "8720182153305",
  name: "Calvé Pindakaas",
  imageUrl: "https://images.openfoodfacts.org/images/products/872/018/215/3305/front_nl.jpg",
  categoryTags: ["en:peanut-butters"],
  category: "pantry",
  matchProductId: "pindakaas",
};

function withProducts(...ids: string[]): AppState {
  return ids.reduce((state, id) => reducer(state, { type: "add-product", product: productById(id)! }), initialState);
}

const items = (state: AppState) => state.adventure!.items;

describe("foto herkennen", () => {
  it("A: adds a recognised product with the parent photo, vision source and no EAN", () => {
    const state = reducer(initialState, {
      type: "add-recognized",
      name: "100% Pindakaas Naturel",
      category: "pantry",
      icon: "pindakaas",
      productId: "pindakaas",
      photoId: "p1",
      pack: TERRA,
    });
    expect(items(state)).toHaveLength(1);
    expect(items(state)[0]).toMatchObject({
      productId: "pindakaas",
      name: "100% Pindakaas Naturel",
      brand: "AH Terra",
      photoId: "p1",
      imageKind: "photo",
      imageSource: "parent",
      source: "vision",
      recognition: { variant: "Naturel", confidence: "high" },
    });
    expect(items(state)[0].ean).toBeUndefined();
  });

  it("gives unmatched products their own id and refuses an empty name", () => {
    let state = reducer(initialState, { type: "add-recognized", name: "Kokosmelk", category: "pantry", icon: "pakket", photoId: "p2", pack: TERRA });
    expect(items(state)[0].productId).toMatch(/^photo:/);
    state = reducer(state, { type: "add-recognized", name: "  ", category: "pantry", icon: "pakket" });
    expect(items(state)).toHaveLength(1);
  });

  it("B: uses the photo for an existing item without a duplicate, keeping id, quantity, category and drawing", () => {
    let state = withProducts("pindakaas", "melk");
    const before = items(state).find((item) => item.productId === "pindakaas")!;
    state = reducer(state, { type: "set-quantity", itemId: before.id, quantity: 3 });
    state = reducer(state, { type: "apply-recognition", itemId: before.id, photoId: "p3", pack: TERRA });
    expect(items(state)).toHaveLength(2);
    const after = items(state).find((item) => item.id === before.id)!;
    expect(after).toMatchObject({ id: before.id, quantity: 3, category: "pantry", icon: "pindakaas", productId: "pindakaas", photoId: "p3", source: "vision" });
  });

  it("keeps a verified Open Food Facts pack and only swaps the picture", () => {
    let state = withProducts("pindakaas");
    const id = items(state)[0].id;
    state = reducer(state, { type: "attach-pack", itemId: id, product: CALVE, source: "off" });
    state = reducer(state, { type: "apply-recognition", itemId: id, photoId: "p4", pack: TERRA });
    expect(items(state)[0]).toMatchObject({ ean: CALVE.ean, source: "off", photoId: "p4", imageSource: "parent", imageKind: "photo" });
    expect(items(state)[0].imageUrl).toBeUndefined();
    expect(items(state)[0].recognition).toBeUndefined();
  });

  it("D: corrections keep the photo; restoring the drawing removes it", () => {
    let state = reducer(initialState, { type: "add-recognized", name: "Pindakaas", category: "pantry", icon: "pindakaas", productId: "pindakaas", photoId: "p5", pack: TERRA });
    const id = items(state)[0].id;
    state = reducer(state, { type: "edit-item", itemId: id, name: "Hazelnootpasta", category: "pantry", icon: "choco", productId: "choco" });
    expect(items(state)[0]).toMatchObject({ name: "Hazelnootpasta", icon: "choco", productId: "choco", photoId: "p5" });
    state = reducer(state, { type: "edit-item", itemId: id, name: "   " });
    expect(items(state)[0].name).toBe("Hazelnootpasta");
    state = reducer(state, { type: "restore-generic", itemId: id });
    expect(items(state)[0]).toMatchObject({ id, name: "Hazelnootpasta", icon: "choco" });
    expect(items(state)[0].photoId).toBeUndefined();
    expect(items(state)[0].imageKind).toBeUndefined();
  });

  it("set-photo replaces only the image of a catalog item", () => {
    let state = withProducts("melk");
    const id = items(state)[0].id;
    state = reducer(state, { type: "set-photo", itemId: id, photoId: "p6" });
    expect(items(state)[0]).toMatchObject({ id, productId: "melk", name: "Melk", photoId: "p6", imageSource: "parent" });
    expect(items(state)[0].source).toBeUndefined();
  });

  it("deleting one item leaves the others and the catalog alone", () => {
    let state = reducer(withProducts("pindakaas", "melk"), { type: "add-recognized", name: "Kokosmelk", category: "pantry", icon: "pakket", photoId: "p7", pack: TERRA });
    const target = items(state).find((item) => item.photoId === "p7")!;
    state = reducer(state, { type: "remove-item", itemId: target.id });
    expect(items(state).map((item) => item.productId)).toEqual(["pindakaas", "melk"]);
    expect(productById("pindakaas")?.name).toBe("Pindakaas");
  });

  it("adventure: a photo item is found with one star, and a confirmed scan keeps the parent photo", () => {
    let state = reducer(initialState, { type: "add-recognized", name: "Pindakaas", category: "pantry", icon: "pindakaas", productId: "pindakaas", photoId: "p8", pack: TERRA });
    state = reducer(state, { type: "start-shopping" });
    expect(activeItem(items(state))?.photoId).toBe("p8");
    const plain = reducer(state, { type: "found" });
    expect(starTotal(items(plain))).toBe(1);
    const confirmed = reducer(state, { type: "found", bonus: "confirmed", pack: CALVE });
    expect(items(confirmed)[0]).toMatchObject({ ean: CALVE.ean, photoId: "p8", imageSource: "parent", stars: 3 });
  });

  it("photos stay referenced through history and saved lists", () => {
    let state = reducer(initialState, { type: "add-recognized", name: "Pindakaas", category: "pantry", icon: "pindakaas", photoId: "p9", pack: TERRA });
    state = reducer(state, { type: "start-shopping" });
    const saved = state.saved;
    expect(saved[0].items[0]).toMatchObject({ photoId: "p9", source: "vision" });
    const empty: Adventure = { ...state.adventure!, items: [], history: [{ items: state.adventure!.items, phase: "shopping", stickers: [] }] };
    expect([...referencedPhotos(empty, [])]).toEqual(["p9"]);
    expect([...referencedPhotos(null, saved)]).toEqual(["p9"]);
    const reopened = reducer({ ...state, adventure: null }, { type: "open-saved", id: saved[0].id });
    expect(items(reopened)[0]).toMatchObject({ photoId: "p9", status: "pending" });
  });
});
