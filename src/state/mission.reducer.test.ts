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
});
