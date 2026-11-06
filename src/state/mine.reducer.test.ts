import { describe, expect, it } from "vitest";
import { MINE_LIMIT, mineKey } from "../domain/mine";
import { initialState, reducer, type AppState } from "./reducer";

const TERRA = {
  brand: "AH Terra",
  packageSize: "350 g",
  recognition: { specific: true, variant: "100% naturel", confidence: "high" as const },
};

function recognise(state: AppState, name: string, productId?: string, pack: object | undefined = TERRA, photoId = "photo-1") {
  return reducer(state, { type: "add-recognized", name, category: "pantry", icon: "pindakaas", productId, photoId, pack: pack as never });
}

describe("Mijn producten", () => {
  it("remembers recognised branded packs and products the catalog lacks, but not plain catalog matches", () => {
    let state = recognise(initialState, "AH Terra Pindakaas", "pindakaas");
    state = recognise(state, "Zeewierchips", undefined, { recognition: { confidence: "medium" } });
    state = recognise(state, "Banaan", "banaan", { recognition: { confidence: "high" } });
    expect(state.mine.map((entry) => entry.name)).toEqual(["Zeewierchips", "AH Terra Pindakaas"]);
    expect(state.mine[1]).toMatchObject({ brand: "AH Terra", photoId: "photo-1", category: "pantry", quantity: 1 });
    expect(state.mine[1]).not.toHaveProperty("status");
  });

  it("keeps one entry per name and brand, newest first, and caps the list", () => {
    let state = recognise(initialState, "AH Terra Pindakaas", "pindakaas", TERRA, "old");
    state = recognise(state, "ah terra pindakaas", "pindakaas", TERRA, "new");
    expect(state.mine).toHaveLength(1);
    expect(state.mine[0].photoId).toBe("new");
    for (let i = 0; i < MINE_LIMIT + 5; i += 1) state = recognise(state, `Product ${i}`, undefined, { recognition: { confidence: "high" } });
    expect(state.mine).toHaveLength(MINE_LIMIT);
  });

  it("adds a remembered product to a new list and counts repeats on the same item", () => {
    let state = recognise(initialState, "AH Terra Pindakaas", "pindakaas");
    const key = mineKey(state.mine[0]);
    state = reducer(state, { type: "new-draft" });
    state = reducer(state, { type: "add-mine", key });
    state = reducer(state, { type: "add-mine", key });
    expect(state.adventure?.items).toHaveLength(1);
    expect(state.adventure?.items[0]).toMatchObject({ name: "AH Terra Pindakaas", brand: "AH Terra", quantity: 2, photoId: "photo-1", status: "pending" });
  });

  it("forgets and restores at the same place", () => {
    let state = recognise(initialState, "A", undefined, { recognition: { confidence: "high" } });
    state = recognise(state, "B", undefined, { recognition: { confidence: "high" } });
    const [b, a] = state.mine;
    state = reducer(state, { type: "forget-mine", key: mineKey(b) });
    expect(state.mine).toEqual([a]);
    state = reducer(state, { type: "restore-mine", entry: b, index: 0 });
    expect(state.mine.map((entry) => entry.name)).toEqual(["B", "A"]);
  });
});
