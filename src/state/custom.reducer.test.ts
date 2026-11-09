import { describe, expect, it } from "vitest";
import { mineKey } from "../domain/mine";
import { analyticsEvents } from "./analyticsEvents";
import { ENRICH_TRIES, initialState, reducer, type Action, type AppState, type CustomEnrichment } from "./reducer";

function play(actions: Action[], from: AppState = initialState) {
  return actions.reduce(reducer, from);
}

const add = (name: string, itemId: string = crypto.randomUUID()): Action => ({ type: "add-custom", name, itemId });

const WALNUTS: CustomEnrichment = {
  displayName: "Cashewnoten",
  canonicalName: "cashewnoot",
  singularName: "cashewnoot",
  pluralName: "cashewnoten",
  childFriendlyLabel: "nootjes",
  category: "pantry",
  subcategory: "noten",
  drawing: "pindakaas",
};

describe("custom generic products", () => {
  it("adds a typed-in product as a custom generic line and remembers it on this device", () => {
    const state = play([add("cashewnoten", "line-1")]);
    const [item] = state.adventure!.items;
    expect(item).toMatchObject({
      id: "line-1",
      productId: "custom:cashewnoot",
      name: "Cashewnoten",
      canonicalName: "cashewnoten",
      category: "pantry",
      kind: "custom_generic",
      source: "user_created",
      quantity: 1,
      status: "pending",
      enrichment: { status: "pending", tries: 0 },
    });
    expect(item.createdAt).toEqual(expect.any(Number));
    expect(item.ean).toBeUndefined();
    expect(item.brand).toBeUndefined();
    expect(item.nutrition).toBeUndefined();
    expect(state.mine).toHaveLength(1);
    expect(mineKey(state.mine[0])).toBe("mine:custom:cashewnoot");
  });

  it("never makes a second product for the singular or plural", () => {
    const state = play([add("cashewnoten"), add("cashewnoot"), add("Cashewnoten")]);
    expect(state.adventure!.items).toHaveLength(1);
    expect(state.adventure!.items[0].quantity).toBe(3);
    expect(state.mine).toHaveLength(1);
  });

  it("adds the catalog product instead when the name is already in the catalog", () => {
    const state = play([add("preien")]);
    expect(state.adventure!.items[0]).toMatchObject({ productId: "prei", name: "Prei" });
    expect(state.mine).toHaveLength(0);
  });

  it("an alias is not the product's name: Cola is its own product, not Frisdrank", () => {
    const state = play([add("cola"), add("appelsap")]);
    expect(state.adventure!.items.map((item) => [item.productId, item.name])).toEqual([
      ["custom:cola", "Cola"],
      ["custom:appelsap", "Appelsap"],
    ]);
  });

  it("refuses phrases and empty input", () => {
    expect(play([add("dingen voor ontbijt")])).toBe(initialState);
    expect(play([add("  ")])).toBe(initialState);
  });

  it("re-uses the remembered product on a later list, with its enrichment", () => {
    const first = play([add("cashewnoten"), { type: "enrich-custom", productId: "custom:cashewnoot", result: WALNUTS }, { type: "new-draft" }]);
    const later = reducer(first, add("cashewnoot"));
    expect(later.adventure!.items).toHaveLength(1);
    expect(later.adventure!.items[0]).toMatchObject({ name: "Cashewnoten", icon: "pindakaas", subcategory: "noten", enrichment: { status: "done" } });
    expect(later.mine).toHaveLength(1);
  });

  it("applies the enrichment to the list, Mijn producten and saved lists", () => {
    const state = play([add("cashewnoten"), { type: "save-favorite" }, { type: "enrich-custom", productId: "custom:cashewnoot", result: WALNUTS }]);
    for (const item of [state.adventure!.items[0], state.mine[0], state.saved[0].items[0]]) {
      expect(item).toMatchObject({ name: "Cashewnoten", canonicalName: "cashewnoot", category: "pantry", icon: "pindakaas", aliases: ["cashewnoot", "nootjes"] });
    }
  });

  it("keeps the typed name when the model suggests a different word", () => {
    const state = play([add("komijn"), { type: "enrich-custom", productId: "custom:komijn", result: { displayName: "Komijnzaad", canonicalName: "komijnzaad", category: "pantry" } }]);
    expect(state.adventure!.items[0]).toMatchObject({ name: "Komijn", aliases: ["Komijnzaad"], icon: "pakket" });
  });

  it("gives up after a few failed tries and keeps the product as typed", () => {
    const failures = Array.from({ length: ENRICH_TRIES }, (): Action => ({ type: "enrich-custom", productId: "custom:rozijn", result: null }));
    const state = play([add("rozijnen"), ...failures]);
    expect(state.adventure!.items[0]).toMatchObject({ name: "Rozijnen", enrichment: { status: "failed", tries: ENRICH_TRIES } });
    expect(reducer(state, { type: "enrich-custom", productId: "custom:rozijn", result: WALNUTS })).toBe(state);
  });

  it("does not overwrite what the parent chose in Review", () => {
    const start = play([add("cashewnoten")]);
    const itemId = start.adventure!.items[0].id;
    const state = play([{ type: "edit-item", itemId, category: "produce", icon: "appel" }, { type: "enrich-custom", productId: "custom:cashewnoot", result: WALNUTS }], start);
    expect(state.adventure!.items[0]).toMatchObject({ category: "produce", icon: "appel" });
  });

  it("keeps its own id when the parent picks a catalog drawing, and that drawing replaces a generated one", () => {
    const start = play([add("komijn"), { type: "set-illustration", productId: "custom:komijn", illustrationId: "drawing-1" }]);
    const itemId = start.adventure!.items[0].id;
    const state = reducer(start, { type: "edit-item", itemId, icon: "pindakaas", productId: "pindakaas" });
    expect(state.adventure!.items[0]).toMatchObject({ productId: "custom:komijn", icon: "pindakaas", illustration: "none" });
    expect(state.adventure!.items[0].illustrationId).toBeUndefined();
    expect(state.mine[0].illustrationId).toBe("drawing-1");
  });

  it("stores the generated drawing on every copy", () => {
    const state = play([add("cashewnoten"), { type: "set-illustration", productId: "custom:cashewnoot", illustrationId: "illustration:custom:cashewnoot" }]);
    expect(state.adventure!.items[0]).toMatchObject({ illustrationId: "illustration:custom:cashewnoot", illustration: "ready" });
    expect(state.mine[0]).toMatchObject({ illustration: "ready" });
    expect(reducer(play([add("komijn")]), { type: "set-illustration", productId: "custom:komijn", illustrationId: null }).mine[0].illustration).toBe("none");
  });

  it("works in the shop like any other product", () => {
    const state = play([add("cashewnoten"), { type: "start-shopping" }, { type: "found" }]);
    expect(state.adventure!.phase).toBe("done");
    expect(state.adventure!.items[0]).toMatchObject({ kind: "custom_generic", status: "found" });
  });

  it("counts product_added with method custom and no product name", () => {
    const before = initialState;
    const action = add("cashewnoten");
    const after = reducer(before, action);
    const events = analyticsEvents(action, before, after);
    expect(events.map((entry) => entry.event)).toEqual([
      { name: "shopping_list_created" },
      { name: "first_list_created" },
      { name: "product_added", data: { method: "custom", category: "pantry" } },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/cashew/i);
  });
});
