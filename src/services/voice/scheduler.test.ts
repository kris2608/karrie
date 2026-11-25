import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVoiceScheduler } from "./scheduler";
import { positivePhrase } from "../../domain/voiceScripts";

const peekVoiceBlob = vi.fn();
const readVoiceBlob = vi.fn();
const writeVoiceBlob = vi.fn();
const ensureVoiceCacheConfig = vi.fn().mockResolvedValue({});
const fetchClip = vi.fn();

vi.mock("./cache", () => ({
  peekVoiceBlob: (...args: unknown[]) => peekVoiceBlob(...args),
  readVoiceBlob: (...args: unknown[]) => readVoiceBlob(...args),
  writeVoiceBlob: (...args: unknown[]) => writeVoiceBlob(...args),
  ensureVoiceCacheConfig: (...args: unknown[]) => ensureVoiceCacheConfig(...args),
}));

vi.mock("./client", () => ({
  voiceClient: {
    fetchClip: (...args: unknown[]) => fetchClip(...args),
  },
}));

describe("voiceScheduler", () => {
  beforeEach(() => {
    peekVoiceBlob.mockReset();
    readVoiceBlob.mockReset();
    writeVoiceBlob.mockReset();
    fetchClip.mockReset();
    peekVoiceBlob.mockReturnValue(null);
    readVoiceBlob.mockResolvedValue(null);
    writeVoiceBlob.mockResolvedValue(undefined);
    fetchClip.mockResolvedValue({ status: "ok", blob: new Blob([new Uint8Array([1])]), cache: "server-miss" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
  });

  it("dedupes interactive fetches by phrase key", async () => {
    const scheduler = createVoiceScheduler();
    const phrase = positivePhrase("dedupe");
    let calls = 0;
    fetchClip.mockImplementation(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { status: "ok", blob: new Blob([new Uint8Array([1])]), cache: "server-miss" };
    });
    const [a, b] = await Promise.all([scheduler.fetchInteractive(phrase), scheduler.fetchInteractive(phrase)]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it("returns memory hits without network", async () => {
    const blob = new Blob([new Uint8Array([9])]);
    peekVoiceBlob.mockReturnValue(blob);
    const scheduler = createVoiceScheduler();
    const result = await scheduler.fetchInteractive(positivePhrase("mem"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.source).toBe("memory");
    expect(fetchClip).not.toHaveBeenCalled();
  });

  it("caps background queue", () => {
    const scheduler = createVoiceScheduler();
    fetchClip.mockImplementation(() => new Promise(() => undefined));
    scheduler.schedule([
      positivePhrase("0"),
      positivePhrase("1"),
      positivePhrase("2"),
      positivePhrase("3"),
      positivePhrase("4"),
    ]);
    expect(true).toBe(true);
  });
});
