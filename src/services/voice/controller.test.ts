import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVoiceController } from "./controller";
import { positivePhrase, productPhrase, welcomePhrase } from "../../domain/voiceScripts";

const trackEvent = vi.fn();
const unlockAudio = vi.fn();
const fetchClip = vi.fn();
const readVoiceBlob = vi.fn();
const ensureVoiceCacheConfig = vi.fn().mockResolvedValue({});
const peekVoiceBlob = vi.fn().mockReturnValue(null);

vi.mock("../analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

vi.mock("../../feedback/sound", () => ({
  unlockAudio: (...args: unknown[]) => unlockAudio(...args),
}));

vi.mock("./cache", () => ({
  ensureVoiceCacheConfig: (...args: unknown[]) => ensureVoiceCacheConfig(...args),
  peekVoiceBlob: (...args: unknown[]) => peekVoiceBlob(...args),
  readVoiceBlob: (...args: unknown[]) => readVoiceBlob(...args),
}));

vi.mock("./client", () => ({
  voiceClient: {
    fetchClip: (...args: unknown[]) => fetchClip(...args),
  },
}));

describe("voiceController", () => {
  beforeEach(() => {
    trackEvent.mockReset();
    unlockAudio.mockReset();
    fetchClip.mockReset();
    readVoiceBlob.mockReset();
    readVoiceBlob.mockResolvedValue(null);
    fetchClip.mockResolvedValue({ status: "error", code: "upstream" });
  });

  it("ignores play while disabled and cancels when turned off", () => {
    const controller = createVoiceController();
    expect(controller.isEnabled()).toBe(false);
    const token = controller.currentToken();
    controller.play(welcomePhrase("t"), { token, priority: "high" });
    expect(controller.currentToken()).toBe(token);
    expect(unlockAudio).not.toHaveBeenCalled();

    controller.setEnabled(true);
    const next = controller.bump();
    expect(next).toBeGreaterThan(token);
    controller.setEnabled(false);
    expect(controller.isEnabled()).toBe(false);
  });

  it("does not use speechSynthesis by default", () => {
    const speak = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn(), getVoices: () => [] });
    const controller = createVoiceController();
    controller.setEnabled(true);
    const token = controller.bump();
    controller.play(positivePhrase("x"), { token, priority: "normal" });
    expect(speak).not.toHaveBeenCalled();
    expect(unlockAudio).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("lets high-priority product override queued praise", () => {
    const controller = createVoiceController();
    controller.setEnabled(true);
    const token = controller.bump();
    controller.play(positivePhrase("p1"), { token, priority: "normal" });
    const product = productPhrase({ productId: "melk", name: "Melk" }, "a:i");
    controller.play(product, { token, priority: "high" });
    expect(controller.currentToken()).toBe(token);
  });

  it("tracks fetch failures when the server returns no audio", async () => {
    const controller = createVoiceController();
    controller.setEnabled(true);
    const token = controller.bump();
    controller.play(positivePhrase("x"), { token, priority: "normal" });
    await vi.waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "voice_playback_failed",
          data: expect.objectContaining({ reason: "fetch", code: "upstream" }),
        }),
      );
    });
  });
});
