import { describe, expect, it } from "vitest";
import { transcriptsMatch } from "./transcript.js";

describe("transcriptsMatch", () => {
  it("matches ignoring punctuation and case", () => {
    expect(transcriptsMatch("Hebbes!", "hebbes")).toBe(true);
    expect(transcriptsMatch("Zo, nu nog melk!", "Zo nu nog melk")).toBe(true);
  });

  it("rejects clearly different text", () => {
    expect(transcriptsMatch("Hebbes!", "Gevonden!")).toBe(false);
  });
});
