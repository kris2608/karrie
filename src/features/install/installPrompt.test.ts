import { describe, expect, it } from "vitest";
import { installCardVisible } from "./installPrompt";

const ready = { hasPrompt: true, standalone: false, used: true, dismissed: false };

describe("install card", () => {
  it("shows after one use when Chrome can install", () => {
    expect(installCardVisible(ready)).toBe(true);
  });

  it("stays hidden until the app was opened, after dismissal, and inside the installed app", () => {
    expect(installCardVisible({ ...ready, hasPrompt: false })).toBe(false);
    expect(installCardVisible({ ...ready, used: false })).toBe(false);
    expect(installCardVisible({ ...ready, dismissed: true })).toBe(false);
    expect(installCardVisible({ ...ready, standalone: true })).toBe(false);
  });
});
