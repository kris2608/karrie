import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVoiceClient, VOICE_DEVICE_PER_DAY } from "./client";

vi.mock("./cache", () => ({
  ensureVoiceCacheConfig: vi.fn(async () => ({})),
  applyVoiceCacheConfig: vi.fn(),
  writeVoiceBlob: vi.fn(async () => undefined),
}));

function memoryStorage(initial?: string): Storage {
  const data = new Map<string, string>();
  if (initial) data.set("karrie-voice-day", initial);
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function audioResponse(cache: "hit" | "miss") {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "X-Voice-Cache": cache },
  });
}

const now = () => Date.parse("2026-11-27T12:00:00Z");

describe("voice device quota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not count a shared cache hit toward the daily generation cap", async () => {
    const storage = memoryStorage();
    const fetch = vi.fn(async () => audioResponse("hit"));
    const client = createVoiceClient({ fetch, online: () => true, origin: "https://api.test", storage, now, sleep: async () => undefined });
    const result = await client.fetchClip("product", "Zoek maar de melk!", { priority: "interactive" });
    expect(result.status).toBe("ok");
    expect(storage.getItem("karrie-voice-day")).toBeNull();
    expect(fetch.mock.calls[0]?.[1]?.headers).not.toHaveProperty("X-Voice-Generate");
  });

  it("counts a new generation and stops asking Edge once the cap is full", async () => {
    const day = "2026-11-27";
    const storage = memoryStorage(JSON.stringify({ day, count: VOICE_DEVICE_PER_DAY - 1 }));
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (headers.get("X-Voice-Generate") === "0") return jsonResponse(429, { code: "device-limit" });
      return audioResponse("miss");
    });
    const client = createVoiceClient({ fetch, online: () => true, origin: "https://api.test", storage, now, sleep: async () => undefined });
    const first = await client.fetchClip("product", "Zoek maar de yoghurt!");
    expect(first.status).toBe("ok");
    expect(JSON.parse(storage.getItem("karrie-voice-day")!).count).toBe(VOICE_DEVICE_PER_DAY);

    const second = await client.fetchClip("product", "Zoek maar de kaas!");
    expect(second).toEqual({ status: "limit", code: "device-limit" });
    const secondHeaders = new Headers(fetch.mock.calls[1]?.[1]?.headers);
    expect(secondHeaders.get("X-Voice-Generate")).toBe("0");
  });

  it("still plays a cached clip after the generation cap", async () => {
    const storage = memoryStorage(JSON.stringify({ day: "2026-11-27", count: VOICE_DEVICE_PER_DAY }));
    const fetch = vi.fn(async () => audioResponse("hit"));
    const client = createVoiceClient({ fetch, online: () => true, origin: "https://api.test", storage, now, sleep: async () => undefined });
    const result = await client.fetchClip("product", "Zoek maar de melk!");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.cache).toBe("server-hit");
    expect(JSON.parse(storage.getItem("karrie-voice-day")!).count).toBe(VOICE_DEVICE_PER_DAY);
  });

  it("retries an upstream failure with backoff and then succeeds", async () => {
    const storage = memoryStorage();
    let calls = 0;
    const fetch = vi.fn(async () => {
      calls += 1;
      if (calls < 3) return jsonResponse(502, { code: "upstream" });
      return audioResponse("miss");
    });
    const sleeps: number[] = [];
    const client = createVoiceClient({
      fetch,
      online: () => true,
      origin: "https://api.test",
      storage,
      now,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    const result = await client.fetchClip("product", "Zoek maar de banaan!");
    expect(result.status).toBe("ok");
    expect(calls).toBe(3);
    expect(sleeps).toEqual([400, 1_200]);
    expect(JSON.parse(storage.getItem("karrie-voice-day")!).count).toBe(1);
  });

  it("gives up after the upstream retries", async () => {
    const fetch = vi.fn(async () => jsonResponse(502, { code: "upstream" }));
    const client = createVoiceClient({
      fetch,
      online: () => true,
      origin: "https://api.test",
      storage: memoryStorage(),
      now,
      sleep: async () => undefined,
    });
    const result = await client.fetchClip("product", "Zoek maar de peer!");
    expect(result).toEqual({ status: "error", code: "upstream" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
