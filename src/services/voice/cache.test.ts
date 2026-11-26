import { describe, expect, it } from "vitest";
import { getVoiceCacheConfig, localCacheKey } from "./cache";

describe("voice cache config", () => {
  it("defaults to coral on gpt-realtime-2.1 under the v6 namespace", () => {
    const cfg = getVoiceCacheConfig();
    expect(cfg.cacheNamespace).toBe("karrie-voice-v6");
    expect(cfg.voice).toBe("coral");
    expect(cfg.model).toBe("gpt-realtime-2.1");
    expect(cfg.instructionVersion).toBe("v6");
    const key = localCacheKey("Hebbes!", "positive");
    expect(key).toContain("coral");
    expect(key).toContain("gpt-realtime-2.1");
    expect(key).toContain("v6");
    expect(key).not.toContain("marin");
    expect(key).not.toContain("v5");
  });
});

