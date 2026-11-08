import { useEffect } from "react";

export type WakeLockHandle = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
  removeEventListener: (type: "release", listener: () => void) => void;
};

export type ScreenWakeLockDeps = {
  request: () => Promise<WakeLockHandle | null>;
  visible: () => boolean;
  onVisibility: (listener: () => void) => () => void;
};

/**
 * Keeps the screen awake while enabled and the page is visible. Browsers drop the lock in the
 * background; returning to the foreground asks again. Unsupported or refused locks are ignored.
 */
export function createScreenWakeLock(deps: ScreenWakeLockDeps) {
  let enabled = false;
  let sentinel: WakeLockHandle | null = null;
  let generation = 0;
  let chain: Promise<void> = Promise.resolve();

  function onReleased() {
    if (sentinel) {
      sentinel.removeEventListener("release", onReleased);
      sentinel = null;
    }
  }

  function hold(next: WakeLockHandle | null) {
    onReleased();
    sentinel = next;
    if (sentinel) sentinel.addEventListener("release", onReleased);
  }

  function run(task: (token: number) => Promise<void>) {
    const token = ++generation;
    chain = chain.then(() => task(token)).catch(() => undefined);
    return chain;
  }

  async function acquire(token: number) {
    if (token !== generation || !enabled || !deps.visible() || sentinel) return;
    const next = await deps.request().catch(() => null);
    if (token !== generation || !enabled || !deps.visible() || sentinel) {
      await next?.release().catch(() => undefined);
      return;
    }
    hold(next);
  }

  async function drop(token: number) {
    if (token !== generation) return;
    const current = sentinel;
    hold(null);
    if (current && !current.released) await current.release().catch(() => undefined);
  }

  function setEnabled(next: boolean) {
    if (enabled === next) {
      if (next && deps.visible() && !sentinel) void run((token) => acquire(token));
      return;
    }
    enabled = next;
    void run((token) => (enabled ? acquire(token) : drop(token)));
  }

  const stopVisibility = deps.onVisibility(() => {
    if (!enabled) return;
    if (deps.visible()) void run((token) => acquire(token));
    else hold(null);
  });

  return {
    setEnabled,
    /** Test helper: whether a lock is held right now. */
    held: () => Boolean(sentinel && !sentinel.released),
    /** Test helper: wait until acquire/release work has settled. */
    idle: () => chain,
    dispose() {
      enabled = false;
      stopVisibility();
      void run((token) => drop(token));
    },
  };
}

export function useScreenWakeLock(enabled: boolean) {
  useEffect(() => {
    const lock = createScreenWakeLock({
      request: async () => {
        const api = navigator.wakeLock;
        if (!api?.request) return null;
        return (await api.request("screen")) as WakeLockHandle;
      },
      visible: () => document.visibilityState === "visible",
      onVisibility: (listener) => {
        document.addEventListener("visibilitychange", listener);
        return () => document.removeEventListener("visibilitychange", listener);
      },
    });
    lock.setEnabled(enabled);
    return () => lock.dispose();
  }, [enabled]);
}
