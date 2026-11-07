import { describe, expect, it } from "vitest";
import { activeSection } from "./sectionSpy";

describe("activeSection", () => {
  it("starts on the first category before anything has scrolled past the header", () => {
    expect(activeSection([300, 900, 1500], 180, false)).toBe(0);
  });

  it("moves on once the next category reaches the header", () => {
    expect(activeSection([-500, 170, 800], 180, false)).toBe(1);
    expect(activeSection([-1200, -500, 180], 180, false)).toBe(2);
  });

  it("picks the last category at the bottom of the page", () => {
    expect(activeSection([-1200, -500, 400], 180, true)).toBe(2);
  });

  it("has nothing to pick without sections", () => {
    expect(activeSection([], 180, false)).toBe(-1);
  });
});
