import { describe, expect, it } from "vitest";
import { cacheKeyParts, VOICE_INSTRUCTION_VERSION } from "../../domain/voiceScripts";
import { applySpeechPlayback, VOICE_PLAYBACK_RATE } from "./playbackRate";

function element(flags: { preservesPitch?: boolean; webkitPreservesPitch?: boolean; mozPreservesPitch?: boolean }) {
  return {
    playbackRate: 1,
    ...flags,
  } as HTMLAudioElement;
}

describe("speech playback rate", () => {
  it("plays 20% faster and locks pitch when the browser can preserve it", () => {
    const audio = element({ preservesPitch: false, webkitPreservesPitch: false });
    applySpeechPlayback(audio);
    expect(VOICE_PLAYBACK_RATE).toBe(1.2);
    expect(audio.playbackRate).toBe(1.2);
    expect(audio.preservesPitch).toBe(true);
    expect((audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch).toBe(true);
  });

  it("uses the prefixed Safari flag on older iOS", () => {
    const audio = element({ webkitPreservesPitch: false });
    applySpeechPlayback(audio);
    expect(audio.playbackRate).toBe(1.2);
    expect((audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch).toBe(true);
  });

  it("does not speed up when pitch cannot be preserved", () => {
    const audio = element({});
    applySpeechPlayback(audio);
    expect(audio.playbackRate).toBe(1);
  });

  it("does not change voice cache keys", () => {
    expect(VOICE_INSTRUCTION_VERSION).toBe("v6");
    const key = cacheKeyParts({
      text: "Hoi! Zullen we samen boodschappen gaan zoeken? Daar gaan we!",
      voice: "coral",
      model: "gpt-realtime-2.1",
      event: "welcome",
    });
    expect(key).toContain("v6");
    expect(key).toContain("coral");
    expect(key).not.toContain(String(VOICE_PLAYBACK_RATE));
  });
});
