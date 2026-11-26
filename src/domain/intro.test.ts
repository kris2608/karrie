import { describe, expect, it } from "vitest";
import { productById } from "../data/catalog";
import { initialState, reducer, type Action, type AppState } from "../state/reducer";
import { needsIntro } from "./intro";

const play = (actions: Action[], from: AppState = initialState) => actions.reduce(reducer, from);
const banaan: Action = { type: "add-product", product: productById("banaan")! };

describe("needsIntro", () => {
  it("is wanted on a device that never used Karrie, also with an empty draft", () => {
    expect(needsIntro(initialState)).toBe(true);
    expect(needsIntro(play([{ type: "new-draft" }]))).toBe(true);
  });

  it("stays wanted when the explanation was only dismissed", () => {
    expect(needsIntro(play([{ type: "intro-seen" }]))).toBe(true);
  });

  it("leaves existing users alone", () => {
    expect(needsIntro(play([banaan]))).toBe(false);
    expect(needsIntro(play([banaan, { type: "start-shopping" }]))).toBe(false);
    const saved = play([banaan, { type: "save-favorite" }]).saved;
    expect(saved).toHaveLength(1);
    expect(needsIntro({ ...initialState, saved })).toBe(false);
    expect(needsIntro({ ...initialState, stickers: ["ster"] })).toBe(false);
    expect(needsIntro({ ...initialState, completedAdventures: ["a1"] })).toBe(false);
    const mine = play([{ type: "add-custom", name: "Cashewnoten", itemId: "line-1" }]).mine;
    expect(mine).toHaveLength(1);
    expect(needsIntro({ ...initialState, mine })).toBe(false);
  });

  it("leaves a finished adventure alone", () => {
    const done = { ...initialState, adventure: { ...play([banaan]).adventure!, phase: "done" as const } };
    expect(needsIntro(done)).toBe(false);
  });
});

describe("intro-seen", () => {
  it("only sets the flag", () => {
    const before = play([banaan]);
    const after = reducer(before, { type: "intro-seen" });
    expect(after.settings).toEqual({ ...before.settings, introSeen: true });
    expect(after.adventure).toBe(before.adventure);
    expect(after.saved).toBe(before.saved);
    expect(after.mine).toBe(before.mine);
    expect(reducer(after, { type: "intro-seen" })).toBe(after);
  });

  it("survives hydrating, and older settings without it still load", () => {
    expect(reducer(initialState, { type: "hydrate", data: { settings: { ...initialState.settings, introSeen: true } } }).settings.introSeen).toBe(true);
    const old = reducer(initialState, { type: "hydrate", data: { settings: { soundEnabled: true, smartDiscovery: false, referenceImages: true } } });
    expect(old.settings).toMatchObject({ soundEnabled: true, smartDiscovery: false });
    expect(needsIntro(old)).toBe(true);
    expect(needsIntro(reducer(initialState, { type: "intro-seen" }))).toBe(true);
  });
});

describe("hint-seen", () => {
  it("keeps a finished hint after the list is cleared and after undo", () => {
    const listed = play([banaan, { type: "hint-seen", hint: "add" }, { type: "hint-seen", hint: "camera" }]);
    const cleared = reducer(listed, { type: "clear-open-items" });
    expect(cleared.settings.addHintSeen).toBe(true);
    expect(cleared.settings.cameraHintSeen).toBe(true);
    expect(cleared.adventure?.items).toHaveLength(0);
    expect(needsIntro(cleared)).toBe(true);

    const shopping = play([banaan, { type: "start-shopping" }, { type: "hint-seen", hint: "shop" }, { type: "found" }]);
    const undone = reducer(shopping, { type: "undo" });
    expect(undone.settings.shopHintSeen).toBe(true);
    expect(undone.adventure?.items[0]?.status).not.toBe("found");
    expect(reducer(undone, { type: "hint-seen", hint: "shop" })).toBe(undone);
  });
});
