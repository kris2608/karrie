import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLongPress, LONG_PRESS } from "./useLongPress";

describe("long press", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires after the hold time and swallows the click that follows", () => {
    const fire = vi.fn();
    const pressing = vi.fn();
    const press = createLongPress(fire, pressing);
    press.down({ x: 10, y: 10 });
    vi.advanceTimersByTime(LONG_PRESS.ms - 1);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(pressing).toHaveBeenLastCalledWith(false);
    expect(press.consumeClick()).toBe(true);
    expect(press.consumeClick()).toBe(false);
  });

  it("does not fire when released early, and the click stays a normal tap", () => {
    const fire = vi.fn();
    const press = createLongPress(fire, () => undefined);
    press.down({ x: 0, y: 0 });
    vi.advanceTimersByTime(300);
    press.cancel();
    vi.advanceTimersByTime(1000);
    expect(fire).not.toHaveBeenCalled();
    expect(press.consumeClick()).toBe(false);
  });

  it("cancels when the finger moves like a scroll, but tolerates a small wobble", () => {
    const fire = vi.fn();
    const press = createLongPress(fire, () => undefined);
    press.down({ x: 0, y: 0 });
    press.move({ x: 6, y: 6 });
    vi.advanceTimersByTime(LONG_PRESS.ms);
    expect(fire).toHaveBeenCalledTimes(1);

    press.down({ x: 0, y: 0 });
    press.move({ x: 0, y: 14 });
    vi.advanceTimersByTime(LONG_PRESS.ms);
    expect(fire).toHaveBeenCalledTimes(1);
  });
});
