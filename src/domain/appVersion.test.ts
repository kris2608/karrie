import { describe, expect, it } from "vitest";
import { appVersionLabel } from "./appVersion";

describe("appVersionLabel", () => {
  it("shows version and build stamp", () => {
    expect(appVersionLabel("0.1.0", "1c7708b")).toBe("Versie 0.1.0 · 1c7708b");
  });

  it("falls back to version alone when the build stamp is empty", () => {
    expect(appVersionLabel("0.1.0", "  ")).toBe("Versie 0.1.0");
  });
});
