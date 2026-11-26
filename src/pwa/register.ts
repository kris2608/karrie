import { registerSW } from "virtual:pwa-register";
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_CHECK_THROTTLE_MS,
  createThrottled,
  markUpdateReload,
  shouldSkipReload,
} from "./updatePolicy";

type ReadyListener = () => void;

const listeners = new Set<ReadyListener>();
let ready = false;
let started = false;
let applying = false;
let apply: (() => Promise<void>) | null = null;

export function subscribeUpdateReady(listener: ReadyListener): () => void {
  listeners.add(listener);
  if (ready) listener();
  return () => listeners.delete(listener);
}

function markReady(): void {
  ready = true;
  for (const listener of listeners) listener();
}

/**
 * Asks the waiting worker to take over, then reloads once it controls the page.
 * Cache Storage and IndexedDB stay: voice clips and the mute setting live there.
 */
export async function applyPendingUpdate(now = Date.now()): Promise<void> {
  if (applying || !apply) return;
  const buildId = import.meta.env.VITE_APP_BUILD;
  if (shouldSkipReload(sessionStorage, now, buildId)) return;
  applying = true;
  markUpdateReload(sessionStorage, now, buildId);
  try {
    await apply();
    await waitForController(4_000);
    window.location.reload();
  } catch {
    applying = false;
  }
}

function waitForController(ms: number): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export function startPwaUpdates(): void {
  if (started || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  started = true;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      markReady();
    },
    onNeedReload() {
      // Another tab may already have activated the worker. Reload stays on the safe-moment path.
      markReady();
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = createThrottled(UPDATE_CHECK_THROTTLE_MS, () => Date.now(), () => {
        void registration.update().catch(() => undefined);
      });
      const onVisible = () => {
        if (document.visibilityState === "visible") check();
      };
      check();
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("focus", check);
      window.addEventListener("pageshow", check);
      window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    },
    onRegisterError() {
      // Local dev does not serve a worker. A failed register stays quiet.
    },
  });

  apply = () => updateSW(true);
}
