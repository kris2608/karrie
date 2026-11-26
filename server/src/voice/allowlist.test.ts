import { describe, expect, it } from "vitest";
import { isAllowedSpeechText, isVoiceEvent } from "./allowlist.js";

describe("voice allowlist", () => {
  it("allows v5 and legacy personality templates", () => {
    expect(isAllowedSpeechText("Hebbes!")).toBe(true);
    expect(isAllowedSpeechText("Hoi! Zullen we samen boodschappen gaan zoeken? Daar gaan we!")).toBe(true);
    expect(isAllowedSpeechText("Hoera! Alle boodschappen zijn gevonden! Wat heb jij dat goed gedaan!")).toBe(true);
    expect(isAllowedSpeechText("Waar is de croissant?")).toBe(true);
    expect(isAllowedSpeechText("Waar is de mais?")).toBe(true);
    expect(isAllowedSpeechText("Kun jij de uien vinden?")).toBe(true);
    expect(isAllowedSpeechText("Nu gaan we het drinkpakje zoeken!")).toBe(true);
    expect(isAllowedSpeechText("Waar is het kant-en-klaarmaaltje?")).toBe(true);
    expect(isAllowedSpeechText("Kun jij de bananen vinden?")).toBe(true);
    expect(isAllowedSpeechText("Nu gaan we brood zoeken!")).toBe(true);
    expect(isAllowedSpeechText("Waar zijn de appels?")).toBe(true);
    expect(isAllowedSpeechText("Zoek maar twee komkommers!")).toBe(true);
    expect(isAllowedSpeechText("Zoek jij de pindakaas?")).toBe(true);
    expect(isAllowedSpeechText("Waar is de melk?")).toBe(true);
    expect(isAllowedSpeechText("Hmm… waar zouden de bananen zijn?")).toBe(true);
    expect(isAllowedSpeechText("Psst… ik heb een speciale opdracht voor je!")).toBe(true);
    expect(isAllowedSpeechText("Tadaa! Dat hebben we samen mooi gedaan!")).toBe(true);
    expect(isAllowedSpeechText("Sleep naar Karrie!")).toBe(true);
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
