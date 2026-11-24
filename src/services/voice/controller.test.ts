import { describe, expect, it } from "vitest";
import { createVoiceController } from "./controller";
import { welcomePhrase } from "../../domain/voiceScripts";

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
});
