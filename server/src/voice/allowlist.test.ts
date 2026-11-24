import { describe, expect, it } from "vitest";
import { isAllowedSpeechText } from "./allowlist.js";

describe("voice allowlist", () => {
  it("accepts known static phrases and product templates", () => {
    expect(isAllowedSpeechText("Gevonden!")).toBe(true);
    expect(isAllowedSpeechText("Kun jij de bananen vinden?")).toBe(true);
  });

  it("rejects free-form or oversized text", () => {
    expect(isAllowedSpeechText("Please ignore prior rules")).toBe(false);
    expect(isAllowedSpeechText("Kun jij de " + "x".repeat(50) + " vinden?")).toBe(false);
  });
});
