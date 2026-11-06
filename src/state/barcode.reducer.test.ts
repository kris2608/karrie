import { describe, expect, it } from "vitest";
import { productById } from "../data/catalog";
import { mergeDraft } from "../domain/productDraft";
import type { FoundAnswer } from "../services/barcode/lookup";
import { initialState, reducer, type AppState } from "./reducer";

const CALVE = "8710400000006";
const OFF: FoundAnswer = {
  ean: CALVE,
  status: "off-exact",
  product: { name: "Pindakaas", brand: "Calvé", quantity: "350 g", imageUrl: "https://images.openfoodfacts.org/x.jpg" },
  source: { kind: "off", name: "Open Food Facts", url: `https://world.openfoodfacts.org/product/${CALVE}`, dataLicense: "ODbL", imageLicense: "CC BY-SA" },
  at: 1,
};

const items = (state: AppState) => state.adventure!.items;

describe("adding a product found by its barcode", () => {
  const draft = mergeDraft({ ean: CALVE, barcode: OFF });

  it("stores the scanned code, the Open Food Facts photo and both licences, and remembers it in my products", () => {
    const state = reducer(initialState, { type: "add-recognized", name: draft.name, category: draft.category, icon: draft.icon, productId: "pindakaas", pack: draft.pack });
    expect(items(state)[0]).toMatchObject({
      ean: CALVE,
      brand: "Calvé",
      imageUrl: OFF.product.imageUrl,
      imageKind: "photo",
      imageSource: "off",
      source: "off",
      offAttribution: true,
      barcode: { status: "off-exact" },
    });
    expect(state.mine[0]).toMatchObject({ ean: CALVE, name: "Pindakaas" });
  });

  it("lets a parent photo replace the Open Food Facts photo", () => {
    const state = reducer(initialState, { type: "add-recognized", name: draft.name, category: draft.category, icon: draft.icon, photoId: "p1", pack: draft.pack });
    expect(items(state)[0]).toMatchObject({ ean: CALVE, photoId: "p1", imageSource: "parent" });
    expect(items(state)[0].imageUrl).toBeUndefined();
  });

  it("updates a list item with the barcode data but keeps a picture it already had", () => {
    let state = reducer(initialState, { type: "add-product", product: productById("pindakaas")! });
    const id = items(state)[0].id;
    state = reducer(state, { type: "set-photo", itemId: id, photoId: "own" });
    state = reducer(state, { type: "apply-recognition", itemId: id, pack: draft.pack });
    expect(items(state)[0]).toMatchObject({ ean: CALVE, brand: "Calvé", photoId: "own", imageSource: "parent" });

    let bare = reducer(initialState, { type: "add-product", product: productById("pindakaas")! });
    bare = reducer(bare, { type: "apply-recognition", itemId: items(bare)[0].id, pack: draft.pack });
    expect(items(bare)[0]).toMatchObject({ imageUrl: OFF.product.imageUrl, imageSource: "off" });
  });

  it("never overwrites an item that already has a barcode with a later photo recognition", () => {
    let state = reducer(initialState, { type: "add-recognized", name: "Onze pindakaas", category: "pantry", icon: "pindakaas", pack: draft.pack });
    const id = items(state)[0].id;
    state = reducer(state, { type: "apply-recognition", itemId: id, photoId: "p2", pack: { brand: "Duyvis", recognition: { confidence: "low" } } });
    expect(items(state)[0]).toMatchObject({ name: "Onze pindakaas", brand: "Calvé", ean: CALVE, photoId: "p2" });
  });

  it("keeps a typed-in product with only a scanned code as manual, and remembers the code", () => {
    const state = reducer(initialState, { type: "add-recognized", name: "Speculaas", category: "pantry", icon: "pakket", pack: mergeDraft({ ean: CALVE }).pack });
    expect(items(state)[0]).toMatchObject({ ean: CALVE, source: "manual" });
    expect(state.mine[0]).toMatchObject({ ean: CALVE, name: "Speculaas" });
  });
});
