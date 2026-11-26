import { describe, expect, it, vi } from "vitest";
import { commitVoiceEnabled } from "./voiceMute";

describe("commitVoiceEnabled", () => {
  it("stops speech before persisting mute, and does not unlock audio", () => {
    const order: string[] = [];
    commitVoiceEnabled(false, {
      setEnabled: (on) => order.push(`enabled:${on}`),
      unlock: () => order.push("unlock"),
      persist: (on) => order.push(`persist:${on}`),
      onMuted: () => order.push("muted"),
    });
    expect(order).toEqual(["enabled:false", "muted", "persist:false"]);
  });

  it("unlocks and enables before persisting sound on", () => {
    const setEnabled = vi.fn();
    const unlock = vi.fn();
    const persist = vi.fn();
    commitVoiceEnabled(true, { setEnabled, unlock, persist });
    expect(unlock).toHaveBeenCalledOnce();
    expect(setEnabled).toHaveBeenCalledWith(true);
    expect(persist).toHaveBeenCalledWith(true);
    expect(unlock.mock.invocationCallOrder[0]).toBeLessThan(setEnabled.mock.invocationCallOrder[0]!);
    expect(setEnabled.mock.invocationCallOrder[0]).toBeLessThan(persist.mock.invocationCallOrder[0]!);
  });
});
