import { describe, expect, it, vi } from "vitest";
import { createVoiceController } from "./controller";
import { positivePhrase, productPhrase, welcomePhrase } from "../../domain/voiceScripts";

describe("voiceController", () => {
  it("ignores play while disabled and cancels when turned off", () => {
    const controller = createVoiceController();
    expect(controller.isEnabled()).toBe(false);
    const token = controller.currentToken();
    controller.play(welcomePhrase("t"), { token, priority: "high" });
    expect(controller.currentToken()).toBe(token);

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
});
