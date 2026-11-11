import { describe, expect, it } from "vitest";
import { declineKey } from "../domain/discovery";
import { starTotal } from "../domain/scoring";
import { activeItem } from "../domain/shopQueue";
import type { AlternativeAssessment } from "../domain/types";
import { initialState, reducer, type AppState } from "./reducer";

const SWEET: AlternativeAssessment = {
  status: "possible",
  evidence: "label",
  criteria: ["no-added-sugar", "no-added-salt"],
  alternativeType: "100% pindakaas",
  targetType: "pindakaas",
  childPrompt: "Kun jij pindakaas met alleen pinda's vinden?",
  source: "photo",
  assessedAt: 1,
};

function listWith(alternative: AlternativeAssessment, extra = 0): AppState {
  let state = reducer(initialState, {
    type: "add-recognized",
    name: "Calvé Pindakaas",
    category: "pantry",
    icon: "pindakaas",
    productId: "pindakaas",
    photoId: "p1",
    pack: { brand: "Calvé", recognition: { confidence: "high" }, alternative },
  });
  for (let index = 0; index < extra; index += 1) {
    state = reducer(state, { type: "add-recognized", name: `Extra ${index}`, category: "pantry", icon: "pindakaas", productId: "pindakaas", pack: { recognition: { confidence: "high" }, alternative } });
  }
  return state;
}

const items = (state: AppState) => state.adventure!.items;

describe("bonus missions", () => {
  it("offers a label-backed mission at the start, at most three", () => {
    const state = reducer(listWith(SWEET, 3), { type: "start-shopping" });
    expect(items(state).filter((item) => item.mission?.status === "offered")).toHaveLength(3);
    expect(activeItem(items(state))?.mission).toEqual({ status: "offered" });
  });

  it("does not offer an inferred mission until the parent turns it on, and not when the setting is off", () => {
    const inferred = listWith({ ...SWEET, evidence: "inferred" });
    expect(activeItem(items(reducer(inferred, { type: "start-shopping" })))?.mission).toBeUndefined();
    const enabled = reducer(inferred, { type: "set-mission", itemId: items(inferred)[0].id, enabled: true });
    expect(activeItem(items(reducer(enabled, { type: "start-shopping" })))?.mission?.status).toBe("offered");
    const off = reducer(listWith(SWEET), { type: "set-discovery", enabled: false });
    expect(activeItem(items(reducer(off, { type: "start-shopping" })))?.mission).toBeUndefined();
  });

  it("turning a mission off remembers the decline for the same product", () => {
    const state = listWith(SWEET);
    const off = reducer(state, { type: "set-mission", itemId: items(state)[0].id, enabled: false });
    expect(off.declined).toEqual([declineKey(items(state)[0])]);
    expect(reducer(off, { type: "set-mission", itemId: items(state)[0].id, enabled: true }).declined).toEqual([]);
  });

  it("keeping the original still gives the bonus, and the decline sticks", () => {
    let state = reducer(listWith(SWEET), { type: "start-shopping" });
    state = reducer(state, { type: "mission-accept" });
    expect(activeItem(items(state))?.mission?.status).toBe("active");
    state = reducer(state, { type: "mission-done", keep: "original" });
    expect(items(state)[0]).toMatchObject({ status: "found", name: "Calvé Pindakaas", photoId: "p1", mission: { status: "done", stars: 2, kept: "original" } });
    expect(starTotal(items(state))).toBe(3);
    expect(state.adventure!.phase).toBe("done");
    expect(state.declined).toHaveLength(1);
  });

  it("swapping shows the example drawing and keeps the original for undo", () => {
    let state = reducer(listWith(SWEET), { type: "start-shopping" });
    state = reducer(state, { type: "mission-accept" });
    const accepted = state;
    state = reducer(state, { type: "mission-done", keep: "alternative" });
    const swapped = items(state)[0];
    expect(swapped).toMatchObject({ status: "found", productId: "pindakaas", icon: "pindakaas", name: "100% pindakaas", mission: { kept: "alternative", stars: 2 } });
    expect(swapped.photoId).toBeUndefined();
    expect(swapped.alternative).toBeUndefined();
    expect(swapped.mission?.swappedFrom?.name).toBe("Calvé Pindakaas");
    expect(starTotal(items(state))).toBe(3);
    const undone = reducer(state, { type: "undo" });
    expect(items(undone)).toEqual(items(accepted));
    expect(starTotal(items(undone))).toBe(0);
  });

  it("'Nu niet' skips the mission and the normal find gives one star", () => {
    let state = reducer(listWith(SWEET), { type: "start-shopping" });
    state = reducer(state, { type: "mission-skip" });
    expect(activeItem(items(state))?.mission?.status).toBe("skipped");
    expect(reducer(state, { type: "mission-done", keep: "original" })).toBe(state);
    state = reducer(state, { type: "found" });
    expect(starTotal(items(state))).toBe(1);
  });

  it("a new trip starts the missions fresh", () => {
    let state = reducer(listWith(SWEET, 1), { type: "start-shopping" });
    state = reducer(state, { type: "mission-skip" });
    state = reducer(state, { type: "found" });
    state = reducer(state, { type: "found" });
    const reopened = reducer({ ...state, adventure: null }, { type: "open-saved", id: state.saved[0].id });
    const again = reducer(reopened, { type: "start-shopping" });
    expect(items(again).every((item) => item.mission?.status === "offered")).toBe(true);
  });

  it("assigns offline play under Bonusmissies without stacking on healthier offers", () => {
    let state = initialState;
    for (const [name, productId, category] of [
      ["Banaan", "banaan", "produce"],
      ["Broccoli", "broccoli", "produce"],
      ["Wortel", "wortel", "produce"],
      ["Melk", "melk", "dairy"],
      ["Yoghurt", "yoghurt", "dairy"],
      ["Brood", "brood", "bakery"],
    ] as const) {
      state = reducer(state, { type: "add-recognized", name, category, icon: productId, productId, pack: { recognition: { confidence: "high" } } });
    }
    state = reducer(state, { type: "start-shopping" });
    const plays = items(state).filter((item) => item.play);
    expect(plays.length).toBeGreaterThanOrEqual(1);
    expect(plays.every((item) => !item.mission)).toBe(true);

    const cleared = reducer(state, { type: "set-discovery", enabled: false });
    expect(items(cleared).every((item) => !item.mission || item.mission.status === "done")).toBe(true);
    expect(items(cleared).every((item) => !item.play || item.play.status === "done" || item.play.status === "skipped")).toBe(true);

    const off = reducer(cleared, { type: "new-draft" });
    let plain = off;
    plain = reducer(plain, { type: "add-recognized", name: "Banaan", category: "produce", icon: "banaan", productId: "banaan", pack: { recognition: { confidence: "high" } } });
    plain = reducer(plain, { type: "start-shopping" });
    expect(items(plain).every((item) => !item.play && !item.mission)).toBe(true);
  });

  it("play skip and done update status without inventing stars", () => {
    let state = initialState;
    state = reducer(state, { type: "add-recognized", name: "Banaan", category: "produce", icon: "banaan", productId: "banaan", pack: { recognition: { confidence: "high" } } });
    state = reducer(state, { type: "add-recognized", name: "Broccoli", category: "produce", icon: "broccoli", productId: "broccoli", pack: { recognition: { confidence: "high" } } });
    state = reducer(state, { type: "add-recognized", name: "Wortel", category: "produce", icon: "wortel", productId: "wortel", pack: { recognition: { confidence: "high" } } });
    state = reducer(state, { type: "start-shopping" });
    const playItem = items(state).find((item) => item.play);
    expect(playItem?.play).toBeTruthy();
    // Move play item to front by skipping others if needed — use dispatch on whatever is active after sorting.
    while (activeItem(items(state)) && !activeItem(items(state))!.play && items(state).some((item) => item.status === "pending" && item.play)) {
      state = reducer(state, { type: "skip" });
    }
    const current = activeItem(items(state));
    if (!current?.play) return;
    state = reducer(state, { type: "play-done" });
    expect(activeItem(items(state))?.play?.status).toBe("done");
    expect(starTotal(items(state))).toBe(0);
  });
});
