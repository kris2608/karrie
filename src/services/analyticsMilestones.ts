import type { Persisted } from "../storage/db";
import { readKv, writeKv } from "../storage/db";
import { trackEvent, type ReturnBucket } from "./analytics";

const KEY = "analyticsMilestones";

export type AnalyticsMilestones = {
  version: 1;
  initialized: boolean;
  firstOpenTracked: boolean;
  firstListTracked: boolean;
  firstAdventureStartedTracked: boolean;
  firstAdventureCompletedTracked: boolean;
  lastOpenDay?: string;
  lastReturnTrackedDay?: string;
};

export const emptyMilestones = (): AnalyticsMilestones => ({
  version: 1,
  initialized: false,
  firstOpenTracked: false,
  firstListTracked: false,
  firstAdventureStartedTracked: false,
  firstAdventureCompletedTracked: false,
});

/** Local calendar day as YYYY-MM-DD. */
export function localDay(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysBetween(earlier: string, later: string): number {
  const a = Date.parse(`${earlier}T12:00:00`);
  const b = Date.parse(`${later}T12:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function returnBucket(days: number): ReturnBucket {
  if (days <= 1) return "1";
  if (days <= 7) return "2-7";
  if (days <= 30) return "8-30";
  return "31+";
}

/** Evidence this browser profile already used Karrie before analytics milestones existed. */
export function inferPriorUse(data: Persisted): boolean {
  if (data.saved.length > 0) return true;
  if (data.completedAdventures.length > 0) return true;
  if (data.mine.length > 0) return true;
  if (data.stickers.length > 0) return true;
  if (data.settings.introSeen) return true;
  if (data.feedbackAsked) return true;
  if (data.adventure && (data.adventure.items.length > 0 || data.adventure.phase !== "draft")) return true;
  return false;
}

export function migrateMilestones(data: Persisted, today: string = localDay()): AnalyticsMilestones {
  const prior = inferPriorUse(data);
  if (!prior) {
    return { ...emptyMilestones(), initialized: true };
  }
  const completed = data.completedAdventures.length > 0;
  const started =
    completed || data.adventure?.phase === "shopping" || data.adventure?.phase === "done";
  const listed =
    data.saved.length > 0 ||
    data.mine.length > 0 ||
    Boolean(data.adventure && data.adventure.items.length > 0) ||
    completed ||
    started;
  return {
    version: 1,
    initialized: true,
    firstOpenTracked: true,
    firstListTracked: listed,
    firstAdventureStartedTracked: Boolean(started),
    firstAdventureCompletedTracked: completed,
    lastOpenDay: today,
  };
}

function clean(raw: unknown): AnalyticsMilestones | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<AnalyticsMilestones>;
  if (value.version !== 1 || typeof value.initialized !== "boolean") return null;
  return {
    version: 1,
    initialized: value.initialized,
    firstOpenTracked: value.firstOpenTracked === true,
    firstListTracked: value.firstListTracked === true,
    firstAdventureStartedTracked: value.firstAdventureStartedTracked === true,
    firstAdventureCompletedTracked: value.firstAdventureCompletedTracked === true,
    ...(typeof value.lastOpenDay === "string" && { lastOpenDay: value.lastOpenDay }),
    ...(typeof value.lastReturnTrackedDay === "string" && { lastReturnTrackedDay: value.lastReturnTrackedDay }),
  };
}

export async function loadMilestones(): Promise<AnalyticsMilestones | null> {
  return clean(await readKv(KEY));
}

export async function saveMilestones(milestones: AnalyticsMilestones): Promise<void> {
  try {
    await writeKv(KEY, milestones);
  } catch {
    // Analytics must never block the app.
  }
}

let memory: AnalyticsMilestones | null = null;
let bootstrapped = false;

/** For tests only. */
export function resetMilestonesMemory(): void {
  memory = null;
  bootstrapped = false;
}

export function getMilestones(): AnalyticsMilestones {
  return memory ?? emptyMilestones();
}

function setMilestones(next: AnalyticsMilestones) {
  memory = next;
  void saveMilestones(next);
}

function catchUpFirsts(data: Persisted, milestones: AnalyticsMilestones): AnalyticsMilestones {
  let next = milestones;
  const listed =
    data.saved.length > 0 || data.mine.length > 0 || Boolean(data.adventure && data.adventure.items.length > 0);
  const started =
    data.completedAdventures.length > 0 || data.adventure?.phase === "shopping" || data.adventure?.phase === "done";
  const completed = data.completedAdventures.length > 0;
  if (!next.firstListTracked && listed && trackEvent({ name: "first_list_created" })) next = { ...next, firstListTracked: true };
  if (!next.firstAdventureStartedTracked && started && trackEvent({ name: "first_adventure_started" })) {
    next = { ...next, firstAdventureStartedTracked: true };
  }
  if (!next.firstAdventureCompletedTracked && completed && trackEvent({ name: "first_adventure_completed" })) {
    next = { ...next, firstAdventureCompletedTracked: true };
  }
  return next;
}

/**
 * After hydrate: migrate existing installs without backfilling Umami, emit first-open or return once.
 * Guarded so React StrictMode does not double-fire in one page load.
 */
export async function bootstrapAnalytics(data: Persisted, today: string = localDay()): Promise<AnalyticsMilestones> {
  if (bootstrapped && memory) return memory;
  bootstrapped = true;

  let milestones = clean(await readKv(KEY)) ?? emptyMilestones();
  const wasUninitialized = !milestones.initialized;
  if (wasUninitialized) milestones = migrateMilestones(data, today);

  if (!milestones.firstOpenTracked) {
    if (trackEvent({ name: "app_first_open" })) {
      milestones = { ...milestones, firstOpenTracked: true, lastOpenDay: today };
    }
  } else if (milestones.lastOpenDay && milestones.lastOpenDay !== today && milestones.lastReturnTrackedDay !== today) {
    const days = daysBetween(milestones.lastOpenDay, today);
    if (days >= 1 && trackEvent({ name: "app_returned", data: { days_since_last_open: returnBucket(days) } })) {
      milestones = { ...milestones, lastOpenDay: today, lastReturnTrackedDay: today };
    }
  } else if (milestones.lastOpenDay !== today) {
    milestones = { ...milestones, lastOpenDay: today };
  }

  // New installs only: recover first-* if Umami was missing when the action happened.
  if (wasUninitialized && !inferPriorUse(data)) milestones = catchUpFirsts(data, milestones);
  else if (!wasUninitialized && milestones.firstOpenTracked) milestones = catchUpFirsts(data, milestones);

  setMilestones(milestones);
  return milestones;
}

/** Persist a lifetime first-* flag after that event was successfully sent to Umami. */
export function markMilestoneSent(flag: "firstListTracked" | "firstAdventureStartedTracked" | "firstAdventureCompletedTracked"): void {
  const current = getMilestones();
  if (!current.initialized || current[flag]) return;
  setMilestones({ ...current, [flag]: true });
}
