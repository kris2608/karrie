import { describe, expect, it } from "vitest";
import { getVoiceCacheConfig, localCacheKey } from "./cache";

describe("voice cache config", () => {
  it("defaults to Maarten under the v7 cache namespace", () => {
    const cfg = getVoiceCacheConfig();
    expect(cfg.cacheNamespace).toBe("karrie-voice-v7-maarten");
    expect(cfg.voice).toBe("nl-NL-MaartenNeural");
    expect(cfg.model).toBe("edge-tts");
    expect(cfg.instructionVersion).toBe("v6");
    expect(cfg.deliveryVersion).toBe("v7");
    const key = localCacheKey("Hebbes!", "positive");
    expect(key).toContain("nl-NL-MaartenNeural");
    expect(key).toContain("edge-tts");
    expect(key).toContain("v7");
    expect(key).not.toContain("coral");
    expect(key).not.toContain("marin");
  });
});

