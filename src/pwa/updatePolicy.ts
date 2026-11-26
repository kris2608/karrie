import type { AdventurePhase } from "../domain/types";

/** How long the done screen plays before a waiting update may reload it. */
export const CELEBRATION_HOLD_MS = 6_500;

/** While the app stays open, look for a new service worker about once an hour. */
export const UPDATE_CHECK_INTERVAL_MS = 45 * 60 * 1000;

/** visibilitychange and focus often fire together; one check covers both. */
export const UPDATE_CHECK_THROTTLE_MS = 5_000;

/** A reload that did not change the build must not immediately reload again. */
export const RELOAD_GUARD_MS = 15_000;

const RELOAD_AT = "karrie-pwa-reload-at";
const ATTEMPT_BUILD = "karrie-pwa-reload-build";
const NOTICE = "karrie-pwa-updated";

export const UPDATE_NOTICE = "Nieuwe versie geladen";

export interface UpdateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function canApplyAppUpdate(input: {
  path: string;
  phase: AdventurePhase | null;
  celebrationSettled: boolean;
}): boolean {
  const path = normalizePath(input.path);
  if (path === "/winkel") return false;
  if (isHome(path)) return true;
  if (path === "/klaar") return input.celebrationSettled;
  if (input.phase === "shopping") return false;
  return true;
}

export function markUpdateReload(storage: UpdateStorage, now: number, buildId: string): void {
  storage.setItem(RELOAD_AT, String(now));
  storage.setItem(ATTEMPT_BUILD, buildId);
  storage.setItem(NOTICE, "1");
}

export function shouldSkipReload(storage: UpdateStorage, now: number, buildId: string): boolean {
  const at = Number(storage.getItem(RELOAD_AT));
  if (Number.isFinite(at) && Math.abs(now - at) < RELOAD_GUARD_MS) return true;
  return storage.getItem(ATTEMPT_BUILD) === buildId;
}

export function takeUpdateNotice(storage: UpdateStorage): string | null {
  if (storage.getItem(NOTICE) !== "1") return null;
  storage.removeItem(NOTICE);
  return UPDATE_NOTICE;
}

export function createThrottled(intervalMs: number, now: () => number, run: () => void): () => void {
  let last = Number.NEGATIVE_INFINITY;
  return () => {
    const t = now();
    if (t - last < intervalMs) return;
    last = t;
    run();
  };
}

function isHome(path: string): boolean {
  return path === "/" || path.startsWith("/l/") || path === "/l" || path.startsWith("/s/") || path === "/s";
}

function normalizePath(path: string): string {
  const bare = path.split("?")[0]?.split("#")[0] ?? "/";
  if (bare.length > 1 && bare.endsWith("/")) return bare.slice(0, -1);
  return bare || "/";
}
