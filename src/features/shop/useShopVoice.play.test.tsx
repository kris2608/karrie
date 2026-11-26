/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CELEBRATION_LINE, START_LINE } from "../../domain/voiceScripts";
import { useShopVoice } from "./useShopVoice";

const play = vi.fn();
const bump = vi.fn(() => 4);
const currentToken = vi.fn(() => 1);
const prefetch = vi.fn();
const releaseShopping = vi.fn();
const cancel = vi.fn();

vi.mock("../../services/voice/controller", () => ({
  voiceController: {
    play: (...args: unknown[]) => play(...args),
    bump: () => bump(),
    currentToken: () => currentToken(),
    prefetch: (...args: unknown[]) => prefetch(...args),
    releaseShopping: () => releaseShopping(),
    cancel: () => cancel(),
    avoidText: () => undefined,
    setEnabled: vi.fn(),
  },
}));

vi.mock("../../services/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../../feedback/sound", () => ({
  unlockAudio: vi.fn(),
}));

const banaan = { id: "i1", productId: "banaan", name: "Banaan", quantity: 1, status: "pending" as const };
const melk = { id: "i2", productId: "melk", name: "Melk", quantity: 1, status: "pending" as const };

function setup(random: () => number = () => 0) {
  return renderHook(() =>
    useShopVoice({
      enabled: true,
      optInSeen: true,
      adventureId: "adv",
      items: [banaan, melk] as never,
      currentId: "i1",
      intro: false,
      locked: false,
      showGuess: false,
      random,
    }),
  );
}

describe("useShopVoice timing", () => {
  beforeEach(() => {
    play.mockReset();
    bump.mockClear();
    prefetch.mockReset();
    releaseShopping.mockReset();
    cancel.mockReset();
    play.mockResolvedValue({ status: "completed", playId: 1 });
  });

  it("preloads start and ending, speaks the start line, and still speaks the product", async () => {
    setup();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const warmed = prefetch.mock.calls[0]?.[0] as Array<{ text: string }>;
    expect(warmed[0]?.text).toBe(START_LINE);
    expect(warmed[1]?.text).toBe(CELEBRATION_LINE);
    const texts = play.mock.calls.map((call) => (call[0] as { text: string }).text);
    expect(texts[0]).toBe(START_LINE);
    expect(texts).toContain("Zoek maar de bananen!");
  });

  it("plays the ending at the found instant, with no delay and no praise in front", async () => {
    const { result } = setup(() => 0);
    await act(async () => {
      await Promise.resolve();
    });
    play.mockClear();
    act(() => {
      result.current.onFoundSuccess(true);
    });
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.calls[0]?.[0]).toMatchObject({ event: "complete", text: CELEBRATION_LINE });
    expect(play.mock.calls[0]?.[1]).toMatchObject({ delayMs: 0, handoff: true, priority: "high" });
  });

  it("praises about one in three and never twice in a row", () => {
    const always = setup(() => 0);
    act(() => {
      always.result.current.onFoundSuccess(false);
      always.result.current.onFoundSuccess(false);
    });
    const praised = play.mock.calls.filter((call) => (call[0] as { event: string }).event === "positive");
    expect(praised).toHaveLength(1);

    play.mockClear();
    const rare = setup(() => 0.99);
    act(() => {
      rare.result.current.onFoundSuccess(false);
      rare.result.current.onFoundSuccess(false);
      rare.result.current.onFoundSuccess(false);
    });
    const later = play.mock.calls.filter((call) => (call[0] as { event: string }).event === "positive");
    expect(later).toHaveLength(1);
    expect(play.mock.calls.filter((call) => (call[0] as { event: string }).event === "complete")).toHaveLength(0);
  });
});
