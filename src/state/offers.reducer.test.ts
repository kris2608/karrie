import { describe, expect, it } from "vitest";
import { productById } from "../data/catalog";
import { offerQueries } from "../storage/offers";
import { initialState, reducer, type AppState } from "./reducer";

const banaan = productById("banaan")!;
const melk = productById("melk")!;

function withDraft(): AppState {
  return reducer(reducer(initialState, { type: "add-product", product: banaan }), { type: "add-product", product: melk });
}

describe("supermarket per list", () => {
  it("sets the supermarket on the list without changing the default for new lists", () => {
    const state = reducer(withDraft(), { type: "set-retailer", retailer: "jumbo" });
    expect(state.adventure?.retailer).toBe("jumbo");
    expect(state.settings).not.toHaveProperty("retailer");
    const cleared = reducer(state, { type: "set-retailer", retailer: null });
    expect(cleared.adventure).not.toHaveProperty("retailer");
    expect(cleared.settings).not.toHaveProperty("retailer");
  });

  it("starts new lists with the default supermarket from settings", () => {
    let state = reducer(initialState, { type: "set-default-retailer", retailer: "lidl" });
    expect(state.adventure).toBeNull();
    state = reducer(state, { type: "add-product", product: banaan });
    expect(state.adventure?.retailer).toBe("lidl");
    expect(reducer(state, { type: "new-draft" }).adventure?.retailer).toBe("lidl");
  });

  it("picking a supermarket before the first product still only touches the list", () => {
    const state = reducer(initialState, { type: "set-retailer", retailer: "jumbo" });
    expect(state.adventure?.retailer).toBe("jumbo");
    expect(state.settings).not.toHaveProperty("retailer");
  });

  it("a default chosen in the parent settings starts new lists, without changing the current one", () => {
    const state = reducer(reducer(withDraft(), { type: "set-retailer", retailer: "jumbo" }), { type: "set-default-retailer", retailer: "albert_heijn" });
    expect(state.adventure?.retailer).toBe("jumbo");
    expect(state.settings.retailer).toBe("albert_heijn");
    expect(reducer(state, { type: "new-draft" }).adventure?.retailer).toBe("albert_heijn");
    const none = reducer(state, { type: "set-default-retailer", retailer: null });
    expect(none.settings).not.toHaveProperty("retailer");
    expect(reducer(none, { type: "new-draft" }).adventure).not.toHaveProperty("retailer");
  });

  it("reopening a saved list does not overwrite the default supermarket", () => {
    let state = reducer(withDraft(), { type: "set-default-retailer", retailer: "lidl" });
    state = reducer(state, { type: "set-retailer", retailer: "jumbo" });
    state = reducer(state, { type: "save-favorite", name: "Zaterdag", store: "" });
    const id = state.saved[0].id;
    state = reducer(state, { type: "open-saved", id });
    expect(state.adventure?.retailer).toBe("jumbo");
    expect(state.settings.retailer).toBe("lidl");
  });

  it("8. switching supermarket changes every question to the new one", () => {
    const jumbo = reducer(withDraft(), { type: "set-retailer", retailer: "jumbo" });
    const ah = reducer(jumbo, { type: "set-retailer", retailer: "albert_heijn" });
    const keys = (state: AppState) => offerQueries(state.adventure!.items, state.adventure!.retailer).map((query) => query.key);
    expect(keys(jumbo)).toEqual(["jumbo|g|banaan", "jumbo|g|melk"]);
    expect(keys(ah)).toEqual(["albert_heijn|g|banaan", "albert_heijn|g|melk"]);
    expect(ah.adventure?.items.map((item) => item.id)).toEqual(jumbo.adventure?.items.map((item) => item.id));
  });

  it("9. a saved list keeps its supermarket when reopened, even after another was picked", () => {
    let state = reducer(withDraft(), { type: "set-retailer", retailer: "jumbo" });
    state = reducer(state, { type: "save-favorite", name: "Zaterdag", store: "" });
    const id = state.saved[0].id;
    expect(state.saved[0].retailer).toBe("jumbo");
    state = reducer(state, { type: "new-draft" });
    state = reducer(state, { type: "set-retailer", retailer: "lidl" });
    state = reducer(state, { type: "open-saved", id });
    expect(state.adventure?.retailer).toBe("jumbo");
  });

  it("9. an older saved list without a supermarket gets the default from settings", () => {
    let state = reducer(withDraft(), { type: "save-favorite", name: "Oud", store: "" });
    const id = state.saved[0].id;
    state = reducer(state, { type: "set-default-retailer", retailer: "albert_heijn" });
    state = reducer(state, { type: "open-saved", id });
    expect(state.adventure?.retailer).toBe("albert_heijn");
    expect(state.settings.retailer).toBe("albert_heijn");
  });

  it("ignores stored supermarkets it does not know", () => {
    const state = reducer(initialState, {
      type: "hydrate",
      data: { settings: { soundEnabled: false, smartDiscovery: true, referenceImages: true, retailer: "plus" as never }, adventure: { ...withDraft().adventure!, retailer: "plus" as never } },
    });
    expect(state.settings).not.toHaveProperty("retailer");
    expect(state.adventure).not.toHaveProperty("retailer");
  });

  it("6. a pasted list asks once per product", () => {
    let state = reducer(initialState, { type: "set-retailer", retailer: "jumbo" });
    state = reducer(state, { type: "add-lines", lines: [{ product: banaan, quantity: 2 }, { product: melk, quantity: 1 }, { product: banaan, quantity: 1 }] });
    expect(offerQueries(state.adventure!.items, "jumbo").map((query) => query.product.name)).toEqual(["Banaan", "Melk"]);
  });

  it("14. the shopping adventure is the same with or without a supermarket", () => {
    const draft = withDraft();
    const plain = reducer(draft, { type: "start-shopping" });
    const picked = reducer(reducer(draft, { type: "set-retailer", retailer: "jumbo" }), { type: "start-shopping" });
    const strip = (state: AppState) => state.adventure!.items.map(({ id: _id, ...item }) => item);
    expect(strip(picked)).toEqual(strip(plain));
    expect(picked.adventure?.phase).toBe("shopping");
    const found = reducer(picked, { type: "found" });
    expect(found.adventure?.items.filter((item) => item.status === "found")).toHaveLength(1);
  });
});
