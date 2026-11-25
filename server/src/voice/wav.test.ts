import { describe, expect, it } from "vitest";
import { pcmToWav } from "./wav.js";

describe("pcmToWav", () => {
  it("wraps PCM with a valid WAV header", () => {
    const pcm = Buffer.alloc(8, 1);
    const wav = pcmToWav(pcm, 24_000);
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.subarray(44).equals(pcm)).toBe(true);
  });
});
