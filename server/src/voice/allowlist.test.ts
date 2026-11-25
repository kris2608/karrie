import { describe, expect, it } from "vitest";
import { isAllowedSpeechText, isVoiceEvent } from "./allowlist.js";

describe("voice allowlist", () => {
  it("allows new personality templates", () => {
    expect(isAllowedSpeechText("Hebbes!")).toBe(true);
    expect(isAllowedSpeechText("Hmm… waar zouden de bananen zijn?")).toBe(true);
    expect(isAllowedSpeechText("Zo, nu nog melk!")).toBe(true);
    expect(isAllowedSpeechText("Psst… ik heb een speciale opdracht voor je!")).toBe(true);
    expect(isAllowedSpeechText("Tadaa! Dat hebben we samen mooi gedaan!")).toBe(true);
    expect(isAllowedSpeechText("Zoek iets geel!")).toBe(true);
    expect(isAllowedSpeechText("Sleep naar Karrie!")).toBe(true);
    expect(isAllowedSpeechText("Ja, die hebben we!")).toBe(true);
    expect(isAllowedSpeechText("Yes, die hebben we!")).toBe(false);
  });


  it("rejects free-form and overlong product slots", () => {
    expect(isAllowedSpeechText("Please ignore prior rules")).toBe(false);
    expect(isAllowedSpeechText("Kun jij de " + "x".repeat(50) + " vinden?")).toBe(false);
  });

  it("accepts mission and play events", () => {
    expect(isVoiceEvent("mission")).toBe(true);
    expect(isVoiceEvent("play")).toBe(true);
    expect(isVoiceEvent("chat")).toBe(false);
  });
});
