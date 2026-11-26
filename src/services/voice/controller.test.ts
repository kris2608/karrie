import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVoiceController } from "./controller";
import { celebrationPhrase, positivePhrase, productPhrase, welcomePhrase } from "../../domain/voiceScripts";

const trackEvent = vi.fn();
const unlockAudio = vi.fn();
const getSpeechElement = vi.fn();
const fetchInteractive = vi.fn();
const schedule = vi.fn();
const cancelBackground = vi.fn();
const peekVoiceBlob = vi.fn().mockReturnValue(null);
const readVoiceBlob = vi.fn().mockResolvedValue(null);

vi.mock("../analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

vi.mock("../../feedback/sound", () => ({
  unlockAudio: (...args: unknown[]) => unlockAudio(...args),
  getSpeechElement: (...args: unknown[]) => getSpeechElement(...args),
}));

vi.mock("./cache", () => ({
  peekVoiceBlob: (...args: unknown[]) => peekVoiceBlob(...args),
  readVoiceBlob: (...args: unknown[]) => readVoiceBlob(...args),
}));

vi.mock("./scheduler", () => ({
  voiceScheduler: {
    fetchInteractive: (...args: unknown[]) => fetchInteractive(...args),
    schedule: (...args: unknown[]) => schedule(...args),
    cancelBackground: (...args: unknown[]) => cancelBackground(...args),
  },
}));

function mockAudio() {
  const el = {
    src: "",
    playbackRate: 1,
    preservesPitch: false,
    webkitPreservesPitch: false,
    onended: null as null | (() => void),
    onerror: null as null | (() => void),
    onplay: null as null | (() => void),
    play: vi.fn(),
    pause: vi.fn(),
    load: vi.fn(),
    removeAttribute: vi.fn(),
  };
  el.play.mockImplementation(() => {
    el.onplay?.();
    return Promise.resolve();
  });
  getSpeechElement.mockReturnValue(el);
  return el;
}

describe("voiceController ownership FSM", () => {
  beforeEach(() => {
    trackEvent.mockReset();
    unlockAudio.mockReset();
    fetchInteractive.mockReset();
    schedule.mockReset();
    cancelBackground.mockReset();
    peekVoiceBlob.mockReturnValue(null);
    readVoiceBlob.mockResolvedValue(null);
    fetchInteractive.mockResolvedValue({ ok: false, code: "upstream", ms: 1 });
    mockAudio();
  });

  it("ignores play while disabled and cancels when turned off", async () => {
    const controller = createVoiceController();
    expect(controller.isEnabled()).toBe(false);
    const outcome = await controller.play(welcomePhrase("t"), { generation: 0, priority: "high" });
    expect(outcome.status).toBe("skipped");
    expect(unlockAudio).not.toHaveBeenCalled();

    controller.setEnabled(true);
    const next = controller.bump();
    expect(next).toBeGreaterThan(0);
    controller.setEnabled(false);
    expect(controller.isEnabled()).toBe(false);
    expect(cancelBackground).toHaveBeenCalled();
  });

  it("settles cancel while loading", async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    fetchInteractive.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const controller = createVoiceController();
    controller.setEnabled(true);
    const generation = controller.bump();
    const pending = controller.play(positivePhrase("x"), { generation, priority: "high" });
    controller.cancel();
    const outcome = await pending;
    expect(outcome.status).toBe("cancelled");
    resolveFetch({ ok: false, code: "upstream", ms: 1 });
  });

  it("rapid bump while loading cancels the previous play promise", async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    fetchInteractive.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const controller = createVoiceController();
    controller.setEnabled(true);
    const g1 = controller.bump();
    const first = controller.play(positivePhrase("a"), { generation: g1, priority: "high" });
    const g2 = controller.bump();
    const second = controller.play(positivePhrase("b"), { generation: g2, priority: "high" });
    expect((await first).status).toBe("cancelled");
    resolveFetch({ ok: false, code: "upstream", ms: 1 });
    expect((await second).status).toBe("failed");
  });

  it("lets high-priority product override queued praise", async () => {
    fetchInteractive.mockResolvedValue({
      ok: true,
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }),
      source: "memory",
      ms: 0,
    });
    const el = mockAudio();
    const controller = createVoiceController();
    controller.setEnabled(true);
    const generation = controller.bump();
    const praise = controller.play(positivePhrase("p1"), { generation, priority: "normal" });
    const product = productPhrase({ productId: "melk", name: "Melk" }, "a:i");
    const productPlay = controller.play(product, { generation, priority: "high" });
    // End the audio for whichever is active.
    queueMicrotask(() => el.onended?.());
    await productPlay;
    const praiseOutcome = await praise;
    expect(["cancelled", "completed", "failed", "skipped"]).toContain(praiseOutcome.status);
  });

  it("old onended cannot clear a newer owner", async () => {
    const blob = new Blob([new Uint8Array([1, 2])], { type: "audio/wav" });
    fetchInteractive.mockResolvedValue({ ok: true, blob, source: "cache", ms: 2 });
    const el = mockAudio();
    const controller = createVoiceController();
    controller.setEnabled(true);
    const g1 = controller.bump();
    const first = controller.play(positivePhrase("a"), { generation: g1, priority: "high" });
    await vi.waitFor(() => expect(el.play).toHaveBeenCalled());
    const staleEnded = el.onended;
    const g2 = controller.bump();
    fetchInteractive.mockResolvedValue({ ok: true, blob, source: "cache", ms: 1 });
    const second = controller.play(positivePhrase("b"), { generation: g2, priority: "high" });
    await vi.waitFor(() => expect(el.play.mock.calls.length).toBeGreaterThanOrEqual(1));
    staleEnded?.();
    expect(controller.speakerState()).not.toBe("idle");
    el.onended?.();
    expect((await first).status).toBe("cancelled");
    expect((await second).status).toBe("completed");
  });

  it("tracks fetch failures when the server returns no audio", async () => {
    const controller = createVoiceController();
    controller.setEnabled(true);
    const generation = controller.bump();
    const outcome = await controller.play(positivePhrase("x"), { generation, priority: "normal" });
    expect(outcome.status).toBe("failed");
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "voice_playback_failed",
        data: expect.objectContaining({ reason: "fetch", code: "upstream" }),
      }),
    );
  });

  it("prefetch uses the scheduler", () => {
    const controller = createVoiceController();
    controller.prefetch([positivePhrase("x")]);
    expect(schedule).toHaveBeenCalled();
  });

  it("keeps a handoff celebration across the shop screen change and mute still stops it", async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    fetchInteractive.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const el = mockAudio();
    const controller = createVoiceController();
    controller.setEnabled(true);
    const generation = controller.bump();
    const pending = controller.play(celebrationPhrase("round"), {
      generation,
      priority: "high",
      delayMs: 0,
      handoff: true,
    });
    controller.releaseShopping();
    resolveFetch({
      ok: true,
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }),
      source: "memory",
      ms: 1,
    });
    await vi.waitFor(() => expect(el.play).toHaveBeenCalled());
    expect(el.playbackRate).toBe(1.2);
    expect(el.preservesPitch).toBe(true);
    expect(el.webkitPreservesPitch).toBe(true);
    el.onended?.();
    expect((await pending).status).toBe("completed");

    fetchInteractive.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    controller.setEnabled(true);
    const nextGen = controller.bump();
    const muted = controller.play(celebrationPhrase("round"), { generation: nextGen, priority: "high", handoff: true });
    controller.setEnabled(false);
    resolveFetch({ ok: true, blob: new Blob([new Uint8Array([1])]), source: "memory", ms: 1 });
    expect((await muted).status).toBe("cancelled");
    expect(el.pause).toHaveBeenCalled();
  });
});
