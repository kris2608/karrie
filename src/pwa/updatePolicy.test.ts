import { describe, expect, it } from "vitest";
import {
  CELEBRATION_HOLD_MS,
  RELOAD_GUARD_MS,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_CHECK_THROTTLE_MS,
  UPDATE_NOTICE,
  canApplyAppUpdate,
  createThrottled,
  markUpdateReload,
  shouldSkipReload,
  takeUpdateNotice,
  type UpdateStorage,
} from "./updatePolicy";

function memory(): UpdateStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe("canApplyAppUpdate", () => {
  it("reloads on the home and shared-list screens even if a hunt is paused", () => {
    for (const path of ["/", "/l/abc", "/s/abc"]) {
      expect(canApplyAppUpdate({ path, phase: "shopping", celebrationSettled: false })).toBe(true);
    }
  });

  it("waits through the shop and until the celebration has finished", () => {
    expect(canApplyAppUpdate({ path: "/winkel", phase: "shopping", celebrationSettled: false })).toBe(false);
    expect(canApplyAppUpdate({ path: "/winkel", phase: "done", celebrationSettled: true })).toBe(false);
    expect(canApplyAppUpdate({ path: "/klaar", phase: "done", celebrationSettled: false })).toBe(false);
    expect(canApplyAppUpdate({ path: "/klaar", phase: "done", celebrationSettled: true })).toBe(true);
  });

  it("reloads between games and holds while a hunt is in progress elsewhere", () => {
    expect(canApplyAppUpdate({ path: "/toevoegen", phase: "draft", celebrationSettled: false })).toBe(true);
    expect(canApplyAppUpdate({ path: "/controleren", phase: null, celebrationSettled: false })).toBe(true);
    expect(canApplyAppUpdate({ path: "/controleren", phase: "done", celebrationSettled: false })).toBe(true);
    expect(canApplyAppUpdate({ path: "/toevoegen", phase: "shopping", celebrationSettled: false })).toBe(false);
    expect(canApplyAppUpdate({ path: "/controleren", phase: "shopping", celebrationSettled: true })).toBe(false);
  });

  it("ignores a query string on the done screen", () => {
    expect(canApplyAppUpdate({ path: "/klaar?sticker=1", phase: "done", celebrationSettled: true })).toBe(true);
  });
});

describe("reload guard", () => {
  it("shows the notice once and will not reload the same build again", () => {
    const storage = memory();
    markUpdateReload(storage, 1_000, "build-a");
    expect(takeUpdateNotice(storage)).toBe(UPDATE_NOTICE);
    expect(takeUpdateNotice(storage)).toBeNull();
    expect(shouldSkipReload(storage, 1_000 + RELOAD_GUARD_MS + 1, "build-a")).toBe(true);
  });

  it("allows a later build in the same session after the guard window", () => {
    const storage = memory();
    markUpdateReload(storage, 1_000, "build-a");
    expect(shouldSkipReload(storage, 1_000 + 1_000, "build-b")).toBe(true);
    expect(shouldSkipReload(storage, 1_000 + RELOAD_GUARD_MS, "build-b")).toBe(false);
  });

  it("checks often enough to matter and holds the celebration", () => {
    expect(UPDATE_CHECK_INTERVAL_MS).toBeGreaterThanOrEqual(30 * 60 * 1000);
    expect(UPDATE_CHECK_INTERVAL_MS).toBeLessThanOrEqual(60 * 60 * 1000);
    expect(CELEBRATION_HOLD_MS).toBeGreaterThan(4_000);
    expect(UPDATE_CHECK_THROTTLE_MS).toBeGreaterThan(0);
  });
});

describe("createThrottled", () => {
  it("runs the first call and drops a second one inside the window", () => {
    let now = 0;
    const calls: number[] = [];
    const check = createThrottled(5_000, () => now, () => calls.push(now));
    check();
    now = 4_000;
    check();
    now = 5_000;
    check();
    expect(calls).toEqual([0, 5_000]);
  });
});
