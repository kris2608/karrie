import { describe, expect, it } from "vitest";
import { productById } from "../data/catalog";
import { discoveredCount } from "../domain/homeAdventure";
import type { Tracked } from "../services/analytics";
import { analyticsEvents } from "./analyticsEvents";
import { initialState, reducer, type Action, type AppState } from "./reducer";

const collect = (name: string, productId?: string, via: "photo" | "barcode" = "photo"): Action => ({
  type: "add-recognized",
  name,
  category: "produce",
  icon: productId ?? "produce",
  productId,
  via,
  discovered: true,
});

function play(actions: Action[], from: AppState = initialState) {
  let state = from;
  const events: Tracked[] = [];
  for (const action of actions) {
    const next = reducer(state, action);
    events.push(...analyticsEvents(action, state, next));
    state = next;
  }
  return { state, events };
}

describe("collecting at home", () => {
  it("counts each collected product once, and not products added another way", () => {
    const { state } = play([collect("Banaan", "banaan"), collect("Appel", "appel"), { type: "add-product", product: productById("peer")! }]);
    expect(state.adventure!.items).toHaveLength(3);
    expect(discoveredCount(state.adventure)).toBe(2);
  });

  it("keeps the catalog drawing and adds no photo for a loose product", () => {
    const item = play([collect("Bananen", "banaan")]).state.adventure!.items[0];
    expect(item).toMatchObject({ productId: "banaan", icon: "banaan", source: "manual" });
    expect(item.photoId).toBeUndefined();
  });

  it("does not count a duplicate made bigger, and drops removed products from the count", () => {
    const first = play([collect("Banaan", "banaan")]).state;
    const banana = first.adventure!.items[0];
    const more = reducer(first, { type: "set-quantity", itemId: banana.id, quantity: 2 });
    expect(discoveredCount(more.adventure)).toBe(1);
    const removed = reducer(more, { type: "remove-item", itemId: banana.id });
    expect(discoveredCount(removed.adventure)).toBe(0);
    const back = reducer(removed, { type: "insert-item", item: banana, index: 0 });
    expect(discoveredCount(back.adventure)).toBe(1);
  });

  it("remembers a celebrated milestone once per list, and a new list starts over", () => {
    const five = play(["Appel", "Peer", "Banaan", "Kiwi", "Druiven"].map((name) => collect(name))).state;
    expect(discoveredCount(five.adventure)).toBe(5);
    const cheered = reducer(five, { type: "cheer", milestone: 5 });
    expect(cheered.adventure!.cheered).toEqual([5]);
    expect(reducer(cheered, { type: "cheer", milestone: 5 })).toBe(cheered);
    const fresh = reducer(cheered, { type: "new-draft" });
    expect(fresh.adventure!.discovered).toBeUndefined();
    expect(fresh.adventure!.cheered).toBeUndefined();
  });

  it("counts product_added once with the identification method and nothing for progress or cheering", () => {
    const { state, events } = play([collect("Banaan", "banaan"), collect("Melk", "melk", "barcode")]);
    const added = events.filter((entry) => entry.event.name === "product_added").map((entry) => "data" in entry.event && entry.event.data);
    expect(added).toEqual([
      { method: "photo", category: "produce" },
      { method: "barcode", category: "produce" },
    ]);
    expect(analyticsEvents({ type: "cheer", milestone: 5 }, state, reducer(state, { type: "cheer", milestone: 5 }))).toEqual([]);
  });

  it("loads lists from before the home adventure, and drops malformed progress", () => {
    const list = play([collect("Banaan", "banaan")]).state.adventure!;
    const { discovered: _d, cheered: _c, ...old } = list;
    const loaded = reducer(initialState, { type: "hydrate", data: { adventure: old } });
    expect(discoveredCount(loaded.adventure)).toBe(0);
    expect(loaded.adventure!.items).toHaveLength(1);

    const broken = reducer(initialState, { type: "hydrate", data: { adventure: { ...list, discovered: "x", cheered: [5, "y"] } as never } });
    expect(broken.adventure!.discovered).toBeUndefined();
    expect(broken.adventure!.cheered).toEqual([5]);

    const kept = reducer(initialState, { type: "hydrate", data: { adventure: list } });
    expect(discoveredCount(kept.adventure)).toBe(1);
  });

  it("does not change shopping: collected items get stars like any other", () => {
    const listed = play([collect("Banaan", "banaan"), { type: "add-product", product: productById("peer")! }]).state;
    const shopping = play([{ type: "start-shopping" }, { type: "found" }, { type: "found" }], listed).state;
    expect(shopping.adventure!.phase).toBe("done");
    expect(shopping.adventure!.items.every((item) => item.status === "found")).toBe(true);
  });
});
