import { describe, expect, it } from "vitest";
import { normalizeTranscript, transcriptsMatch } from "./transcript.js";

describe("transcriptsMatch", () => {
  it("matches ignoring punctuation and case", () => {
    expect(transcriptsMatch("Hebbes!", "hebbes")).toBe(true);
    expect(transcriptsMatch("Zo, nu nog melk!", "Zo nu nog melk")).toBe(true);
  });

  it("maps Dutch number words to digits", () => {
    expect(normalizeTranscript("twee komkommers")).toBe("2 komkommers");
    expect(transcriptsMatch("Zoek maar twee komkommers!", "Zoek maar 2 komkommers!")).toBe(true);
  });

  it("rejects clearly different text", () => {
    expect(transcriptsMatch("Hebbes!", "Gevonden!")).toBe(false);
  });

  it("rejects incomplete substring speech", () => {
    expect(transcriptsMatch("Kun jij de bananen vinden?", "bananen")).toBe(false);
    expect(transcriptsMatch("Kun jij de bananen vinden?", "Kun jij de")).toBe(false);
  });

  it("rejects padded speech with extra content words", () => {
    expect(transcriptsMatch("Hebbes!", "Hebbes gevonden hoor")).toBe(false);
  });
});
