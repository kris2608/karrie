import { describe, expect, it } from "vitest";
import { pcmToWav } from "./wav.js";
import { checkPcmClip, checkSpokenClip } from "./clipQuality.js";

function tone(ms: number, amplitude: number, rate = 24_000): Buffer {
  const samples = Math.round((rate * ms) / 1000);
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) pcm.writeInt16LE(amplitude, i * 2);
  return pcm;
}

describe("clip quality", () => {
  it("rejects the near-silent hagelslag and frisdrank shape", () => {
    const pcm = tone(4_800, 8);
    const verdict = checkPcmClip(pcm, 24_000, "Kun jij de hagelslag vinden?");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("silent");
    expect(checkSpokenClip(pcmToWav(pcm, 24_000), "Waar is frisdrank?").ok).toBe(false);
  });

  it("rejects a stretched luiers take", () => {
    const verdict = checkPcmClip(tone(5_000, 16_000), 24_000, "Waar zijn luiers?");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("stretched");
  });

  it("accepts a normal short praise and a normal product line", () => {
    expect(checkPcmClip(tone(900, 8_000), 24_000, "Hebbes!").ok).toBe(true);
    expect(checkSpokenClip(pcmToWav(tone(1_700, 12_000), 24_000), "Waar is de melk?").ok).toBe(true);
  });

  it("rejects audio that is too short for the sentence", () => {
    const verdict = checkPcmClip(tone(120, 8_000), 24_000, "Kun jij de hagelslag vinden?");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("too-short");
  });
});
