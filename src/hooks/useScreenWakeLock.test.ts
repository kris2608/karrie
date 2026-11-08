import { describe, expect, it, vi } from "vitest";
import { createScreenWakeLock, type WakeLockHandle } from "./useScreenWakeLock";

function sentinel(): WakeLockHandle {
  const listeners = new Set<() => void>();
  const handle: WakeLockHandle = {
    released: false,
    async release() {
      if (handle.released) return;
      handle.released = true;
      for (const listener of [...listeners]) listener();
    },
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
  };
  return handle;
}

function setup(request: () => Promise<WakeLockHandle | null>) {
  let visible = true;
  const visibility = new Set<() => void>();
  const lock = createScreenWakeLock({
    request,
    visible: () => visible,
    onVisibility: (listener) => {
      visibility.add(listener);
      return () => visibility.delete(listener);
    },
  });
  const env = {
    lock,
    async flush() {
      await lock.idle();
    },
    hide() {
      visible = false;
      for (const listener of [...visibility]) listener();
    },
    show() {
      visible = true;
      for (const listener of [...visibility]) listener();
    },
    listening: () => visibility.size,
  };
  return env;
}

describe("createScreenWakeLock", () => {
  it("acquires while enabled and visible, and releases on disable or dispose", async () => {
    const first = sentinel();
    const request = vi.fn().mockResolvedValueOnce(first);
    const env = setup(request);
    env.lock.setEnabled(true);
    await env.flush();
    expect(env.lock.held()).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);

    env.lock.setEnabled(false);
    await env.flush();
    expect(first.released).toBe(true);
    expect(env.lock.held()).toBe(false);

    const second = sentinel();
    request.mockResolvedValueOnce(second);
    env.lock.setEnabled(true);
    await env.flush();
    env.lock.dispose();
    await env.flush();
    expect(second.released).toBe(true);
    expect(env.listening()).toBe(0);
  });

  it("reacquires after returning to the foreground, without a second lock while one is held", async () => {
    const request = vi.fn().mockImplementation(async () => sentinel());
    const env = setup(request);
    env.lock.setEnabled(true);
    await env.flush();
    expect(request).toHaveBeenCalledTimes(1);

    env.lock.setEnabled(true);
    await env.flush();
    expect(request).toHaveBeenCalledTimes(1);

    env.hide();
    await env.flush();
    env.show();
    await env.flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(env.lock.held()).toBe(true);
  });

  it("does nothing when the API is missing or the request is refused", async () => {
    const missing = setup(async () => null);
    missing.lock.setEnabled(true);
    await missing.flush();
    expect(missing.lock.held()).toBe(false);

    const refused = setup(async () => {
      throw new Error("NotAllowedError");
    });
    refused.lock.setEnabled(true);
    await refused.flush();
    expect(refused.lock.held()).toBe(false);
  });

  it("drops a late answer when disabled while the request was in flight", async () => {
    let resolveRequest!: (value: WakeLockHandle | null) => void;
    const pending = new Promise<WakeLockHandle | null>((resolve) => {
      resolveRequest = resolve;
    });
    const env = setup(() => pending);
    env.lock.setEnabled(true);
    await Promise.resolve();
    env.lock.setEnabled(false);
    const late = sentinel();
    resolveRequest(late);
    await env.flush();
    expect(late.released).toBe(true);
    expect(env.lock.held()).toBe(false);
  });
});
