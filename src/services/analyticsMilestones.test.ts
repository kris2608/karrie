import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPersisted, type Persisted } from "../storage/db";
import { resetTracking } from "./analytics";
import {
  bootstrapAnalytics,
  daysBetween,
  emptyMilestones,
  inferPriorUse,
  localDay,
  migrateMilestones,
  resetMilestonesMemory,
  returnBucket,
} from "./analyticsMilestones";

const store = new Map<string, unknown>();

vi.mock("../storage/db", async () => {
  const actual = await vi.importActual<typeof import("../storage/db")>("../storage/db");
  return {
    ...actual,
    readKv: async (key: string) => store.get(key),
    writeKv: async (key: string, value: unknown) => void store.set(key, value),
    emptyPersisted: actual.emptyPersisted,
  };
});

function base(patch: Partial<Persisted> = {}): Persisted {
  return { ...emptyPersisted(), ...patch };
}

describe("analytics milestones", () => {
  const track = vi.fn();
  beforeEach(() => {
    store.clear();
    resetTracking();
    resetMilestonesMemory();
    track.mockReset();
    vi.stubGlobal("window", { umami: { track } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetMilestonesMemory();
    store.clear();
  });

  it("buckets return periods and day gaps", () => {
    expect(returnBucket(1)).toBe("1");
    expect(returnBucket(3)).toBe("2-7");
    expect(returnBucket(20)).toBe("8-30");
    expect(returnBucket(40)).toBe("31+");
    expect(daysBetween("2026-11-01", "2026-11-08")).toBe(7);
  });

  it("detects prior use without inventing a first-open", () => {
    expect(inferPriorUse(base())).toBe(false);
    expect(inferPriorUse(base({ settings: { ...emptyPersisted().settings, introSeen: true } }))).toBe(true);
    expect(inferPriorUse(base({ completedAdventures: ["a1"] }))).toBe(true);
    const migrated = migrateMilestones(base({ completedAdventures: ["a1"] }), "2026-11-09");
    expect(migrated.firstOpenTracked).toBe(true);
    expect(migrated.firstAdventureCompletedTracked).toBe(true);
    expect(migrated.lastOpenDay).toBe("2026-11-09");
  });

  it("emits app_first_open once for a new device", async () => {
    const first = await bootstrapAnalytics(base(), "2026-11-09");
    expect(first.firstOpenTracked).toBe(true);
    expect(track.mock.calls.map(([name]) => name)).toEqual(["app_first_open"]);
    track.mockClear();
    resetMilestonesMemory();
    await bootstrapAnalytics(base(), "2026-11-09");
    expect(track).not.toHaveBeenCalled();
  });

  it("does not treat an existing install as newly acquired", async () => {
    await bootstrapAnalytics(base({ completedAdventures: ["a1"], stickers: ["ster"] }), "2026-11-09");
    expect(track).not.toHaveBeenCalled();
  });

  it("emits app_returned on another local day at most once", async () => {
    await bootstrapAnalytics(base(), "2026-11-08");
    track.mockClear();
    resetMilestonesMemory();
    await bootstrapAnalytics(base(), "2026-11-09");
    expect(track.mock.calls).toEqual([["app_returned", { days_since_last_open: "1" }]]);
    track.mockClear();
    resetMilestonesMemory();
    await bootstrapAnalytics(base(), "2026-11-09");
    expect(track).not.toHaveBeenCalled();
  });

  it("does nothing without Umami and keeps first-open unset", async () => {
    vi.stubGlobal("window", {});
    const milestones = await bootstrapAnalytics(base(), "2026-11-09");
    expect(milestones.firstOpenTracked).toBe(false);
    expect(localDay().length).toBe(10);
  });
});

describe("emptyMilestones", () => {
  it("starts uninitialized", () => {
    expect(emptyMilestones().initialized).toBe(false);
  });
});
