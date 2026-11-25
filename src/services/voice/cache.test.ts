import { describe, expect, it } from "vitest";
import { applyVoiceCacheConfig, getVoiceCacheConfig, localCacheKey } from "./cache";

describe("voice cache config", () => {
  it("builds keys from server config and bumps namespace to v4", () => {
    applyVoiceCacheConfig({
      model: "gpt-realtime-2.1-mini",
      voice: "marin",
      instructionVersion: "v4",
      deliveryVersion: "v4",
      templateVersion: "v4",
      cacheNamespace: "karrie-voice-v4",
    });
    const cfg = getVoiceCacheConfig();
    expect(cfg.cacheNamespace).toBe("karrie-voice-v4");
    expect(cfg.voice).toBe("marin");
    const key = localCacheKey("Hebbes!", "positive");
    expect(key).toContain("marin");
    expect(key).toContain("gpt-realtime-2.1-mini");
    expect(key).toContain("v4");
  });
});

