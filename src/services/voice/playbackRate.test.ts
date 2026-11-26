import { describe, expect, it } from "vitest";
import { cacheKeyParts, VOICE_CACHE_NAMESPACE, VOICE_DELIVERY_VERSION, VOICE_INSTRUCTION_VERSION } from "../../domain/voiceScripts";
import { applySpeechPlayback, VOICE_PLAYBACK_RATE } from "./playbackRate";

describe("speech playback rate", () => {
  it("plays at normal speed so the browser does not time-stretch", () => {
    const audio = { playbackRate: 1.2 } as HTMLAudioElement;
    applySpeechPlayback(audio);
    expect(VOICE_PLAYBACK_RATE).toBe(1);
    expect(audio.playbackRate).toBe(1);
  });

  it("keeps coral clips out of the Maarten cache key", () => {
    expect(VOICE_INSTRUCTION_VERSION).toBe("v6");
    expect(VOICE_DELIVERY_VERSION).toBe("v7");
    expect(VOICE_CACHE_NAMESPACE).toBe("karrie-voice-v7-maarten");
    const key = cacheKeyParts({
      text: "Hebbes!",
      voice: "nl-NL-MaartenNeural",
      model: "edge-tts",
      event: "positive",
    });
    expect(key).toContain("v7");
    expect(key).toContain("nl-NL-MaartenNeural");
    expect(key).toContain("edge-tts");
    expect(key).not.toContain("coral");
    expect(key).not.toContain("marin");
  });
});
