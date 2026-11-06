import { describe, expect, it } from "vitest";
import { productById } from "../data/catalog";
import { starTotal } from "../domain/scoring";
import { activeItem } from "../domain/shopQueue";
import type { ScannedProduct } from "../domain/types";
import { initialState, reducer, type AppState } from "./reducer";

const CALVE: ScannedProduct = {
  ean: "8720182153305",
  name: "Calvé Pindakaas",
  brand: "Calvé",
  packageSize: "350 g",
  imageUrl: "https://images.openfoodfacts.org/images/products/872/018/215/3305/front_nl.jpg",
  categoryTags: ["en:spreads", "en:peanut-butters"],
  category: "pantry",
  matchProductId: "pindakaas",
};

const UNKNOWN: ScannedProduct = { ean: "8710400000006", categoryTags: [], category: "pantry" };

function withProducts(...ids: string[]): AppState {
  return ids.reduce((state, id) => reducer(state, { type: "add-product", product: productById(id)! }), initialState);
}

function item(state: AppState, productId: string) {
  return state.adventure!.items.find((entry) => entry.productId === productId)!;
}

describe("ouders scannen", () => {
  it("A: voegt een gescand product toe en voorkomt dubbele EAN's", () => {
    let state = reducer(initialState, { type: "add-scanned", product: CALVE, name: "Calvé Pindakaas", category: "pantry", icon: "pindakaas", source: "off" });
    expect(state.adventure!.items).toHaveLength(1);
    expect(state.adventure!.items[0]).toMatchObject({
      productId: "pindakaas",
      name: "Calvé Pindakaas",
      ean: CALVE.ean,
      brand: "Calvé",
      packageSize: "350 g",
      imageKind: "photo",
      source: "off",
      offAttribution: true,
      quantity: 1,
    });
    state = reducer(state, { type: "add-scanned", product: CALVE, name: "Calvé Pindakaas", category: "pantry", icon: "pindakaas", source: "off" });
    expect(state.adventure!.items).toHaveLength(1);
    expect(state.adventure!.items[0].quantity).toBe(2);
  });

  it("B: geeft een onbekende EAN een eigen id zonder foto", () => {
    const state = reducer(initialState, { type: "add-scanned", product: UNKNOWN, name: "Ontbijtkoek", category: "bakery", icon: "brood", source: "manual" });
    expect(state.adventure!.items[0]).toMatchObject({ productId: "ean:8710400000006", name: "Ontbijtkoek", ean: UNKNOWN.ean, source: "manual", imageKind: "generic" });
    expect(state.adventure!.items[0].imageUrl).toBeUndefined();
  });

  it("C: koppelt een verpakking aan een bestaand product met hetzelfde id en aantal", () => {
    let state = withProducts("pindakaas", "melk");
    const before = item(state, "pindakaas");
    state = reducer(state, { type: "set-quantity", itemId: before.id, quantity: 3 });
    state = reducer(state, { type: "attach-pack", itemId: before.id, product: CALVE });
    const after = item(state, "pindakaas");
    expect(after).toMatchObject({ id: before.id, quantity: 3, category: before.category, icon: "pindakaas", name: "Pindakaas", imageKind: "photo", ean: CALVE.ean });
    expect(state.adventure!.items).toHaveLength(2);
  });

  it("D: zet de Karrie-tekening terug zonder het product te verwijderen", () => {
    let state = withProducts("pindakaas");
    const id = item(state, "pindakaas").id;
    state = reducer(state, { type: "attach-pack", itemId: id, product: CALVE });
    state = reducer(state, { type: "restore-generic", itemId: id });
    const restored = item(state, "pindakaas");
    expect(restored.id).toBe(id);
    expect(restored.imageUrl).toBeUndefined();
    expect(restored.ean).toBeUndefined();
    expect(restored.imageKind).toBeUndefined();
  });

  it("E: verwijdert en zet terug op dezelfde plek", () => {
    let state = withProducts("appel", "pindakaas", "melk");
    const removed = item(state, "pindakaas");
    const index = state.adventure!.items.indexOf(removed);
    state = reducer(state, { type: "remove-item", itemId: removed.id });
    expect(state.adventure!.items.map((entry) => entry.productId)).toEqual(["appel", "melk"]);
    state = reducer(state, { type: "insert-item", item: removed, index });
    expect(state.adventure!.items.map((entry) => entry.productId)).toEqual(["appel", "pindakaas", "melk"]);
    expect(reducer(state, { type: "insert-item", item: removed, index })).toBe(state);
  });

  it("bewaart foto's en EAN's in opgeslagen lijstjes", () => {
    let state = withProducts("pindakaas");
    state = reducer(state, { type: "attach-pack", itemId: item(state, "pindakaas").id, product: CALVE });
    state = reducer(state, { type: "save-favorite" });
    expect(state.saved[0].items[0]).toMatchObject({ ean: CALVE.ean, imageKind: "photo", imageUrl: CALVE.imageUrl });
    const listId = state.saved[0].id;
    state = reducer(state, { type: "new-draft" });
    state = reducer(state, { type: "open-saved", id: listId });
    expect(item(state, "pindakaas")).toMatchObject({ ean: CALVE.ean, imageKind: "photo", status: "pending" });
  });

  it("laadt oude lijstjes zonder verpakkingsvelden", () => {
    const state = reducer(initialState, {
      type: "hydrate",
      data: { saved: [{ id: "oud", name: "Oud", favorite: true, updatedAt: 1, items: [{ productId: "melk", name: "Melk", icon: "melk", category: "dairy", quantity: 2 }] }] },
    });
    const opened = reducer(state, { type: "open-saved", id: "oud" });
    expect(opened.adventure!.items[0]).toMatchObject({ productId: "melk", quantity: 2, status: "pending" });
    expect(opened.adventure!.items[0].ean).toBeUndefined();
  });
});

describe("scanmissies", () => {
  function shopWithPack() {
    let state = withProducts("melk", "pindakaas");
    state = reducer(state, { type: "attach-pack", itemId: item(state, "pindakaas").id, product: CALVE });
    return reducer(state, { type: "start-shopping" });
  }

  it("F: een exacte scan geeft 3 sterren, maar maar één keer", () => {
    let state = shopWithPack();
    while (activeItem(state.adventure!.items)?.productId !== "pindakaas") state = reducer(state, { type: "skip" });
    state = reducer(state, { type: "found", bonus: "verified" });
    expect(item(state, "pindakaas")).toMatchObject({ status: "found", stars: 3, scan: "verified" });
    expect(starTotal(state.adventure!.items)).toBe(3);
    state = reducer(state, { type: "found" });
    expect(item(state, "pindakaas").stars).toBe(3);
    expect(starTotal(state.adventure!.items)).toBe(4);
  });

  it("G: een bevestigde scan koppelt de verpakking en geeft bonus", () => {
    let state = reducer(withProducts("pindakaas"), { type: "start-shopping" });
    state = reducer(state, { type: "found", bonus: "confirmed", pack: CALVE });
    expect(item(state, "pindakaas")).toMatchObject({ stars: 3, scan: "confirmed", ean: CALVE.ean, imageKind: "photo" });
    expect(state.adventure!.phase).toBe("done");
    expect(state.saved[0].items[0].ean).toBe(CALVE.ean);
  });

  it("H: gewoon Gevonden geeft 1 ster", () => {
    let state = shopWithPack();
    state = reducer(state, { type: "found" });
    expect(state.adventure!.items.find((entry) => entry.status === "found")).toMatchObject({ stars: 1 });
    expect(starTotal(state.adventure!.items)).toBe(1);
  });

  it("I: terug zet sterren en scanstatus terug", () => {
    let state = reducer(withProducts("pindakaas", "melk"), { type: "start-shopping" });
    state = reducer(state, { type: "found", bonus: "confirmed", pack: CALVE });
    expect(starTotal(state.adventure!.items)).toBe(3);
    state = reducer(state, { type: "undo" });
    expect(starTotal(state.adventure!.items)).toBe(0);
    const restored = state.adventure!.items.find((entry) => entry.productId === "pindakaas")!;
    expect(restored.scan).toBeUndefined();
    expect(restored.ean).toBeUndefined();
  });

  it("J: een nieuw avontuur begint zonder oude sterren", () => {
    let state = reducer(withProducts("pindakaas"), { type: "start-shopping" });
    state = reducer(state, { type: "found", bonus: "confirmed", pack: CALVE });
    const listId = state.saved[0].id;
    state = reducer(state, { type: "open-saved", id: listId });
    state = reducer(state, { type: "start-shopping" });
    expect(state.adventure!.items[0]).toMatchObject({ status: "pending", ean: CALVE.ean });
    expect(state.adventure!.items[0].stars).toBeUndefined();
    expect(state.adventure!.items[0].scan).toBeUndefined();
  });
});
