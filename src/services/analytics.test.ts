import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTracking, trackEvent } from "./analytics";

describe("trackEvent", () => {
  const track = vi.fn();
  beforeEach(() => {
    resetTracking();
    track.mockReset();
    vi.stubGlobal("window", { umami: { track } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the name and data to Umami", () => {
    trackEvent({ name: "adventure_started", data: { item_count: 3 } });
    trackEvent({ name: "shopping_list_created" });
    expect(track.mock.calls).toEqual([["adventure_started", { item_count: 3 }], ["shopping_list_created"]]);
  });

  it("sends an event with a once-key only once per session", () => {
    trackEvent({ name: "adventure_completed", data: { item_count: 2, completed_missions: 0 } }, "a1");
    trackEvent({ name: "adventure_completed", data: { item_count: 2, completed_missions: 0 } }, "a1");
    trackEvent({ name: "adventure_started", data: { item_count: 2 } }, "a1");
    expect(track).toHaveBeenCalledTimes(2);
  });

  it("does nothing without Umami, and survives a tracker that throws or rejects", async () => {
    vi.stubGlobal("window", {});
    expect(() => trackEvent({ name: "shopping_list_created" })).not.toThrow();
    vi.stubGlobal("window", {
      umami: {
        track: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(() => trackEvent({ name: "shopping_list_created" })).not.toThrow();
    vi.stubGlobal("window", { umami: { track: () => Promise.reject(new Error("offline")) } });
    expect(() => trackEvent({ name: "shopping_list_created" })).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("does nothing outside a browser", () => {
    vi.unstubAllGlobals();
    expect(() => trackEvent({ name: "shopping_list_created" })).not.toThrow();
  });
});
