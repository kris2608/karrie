import { describe, expect, it } from "vitest";
import { applyVoiceCacheConfig, getVoiceCacheConfig, localCacheKey } from "./cache";

describe("voice cache config", () => {
  it("builds keys from server config and bumps namespace to v3", () => {
    applyVoiceCacheConfig({
      model: "gpt-realtime-2.1-mini",
      voice: "marin",
      instructionVersion: "v3",
      deliveryVersion: "v3",
      templateVersion: "v3",
      cacheNamespace: "karrie-voice-v3",
    });
    const cfg = getVoiceCacheConfig();
    expect(cfg.cacheNamespace).toBe("karrie-voice-v3");
    expect(cfg.voice).toBe("marin");
    const key = localCacheKey("Hebbes!", "positive");
    expect(key).toContain("marin");
    expect(key).toContain("gpt-realtime-2.1-mini");
    expect(key).toContain("v3");
  });
});
