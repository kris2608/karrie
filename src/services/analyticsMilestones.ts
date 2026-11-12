import type { Adventure } from "../domain/types";
import type { Persisted } from "../storage/db";
import { readKv, writeKv } from "../storage/db";
import { hasTracked, trackEvent, type ReturnBucket } from "./analytics";

const KEY = "analyticsMilestones";
const ADVENTURE_ACK_CAP = 100;

export type AnalyticsMilestones = {
  version: 1;
  initialized: boolean;
  firstOpenTracked: boolean;
  firstListTracked: boolean;
  firstAdventureStartedTracked: boolean;
  firstAdventureCompletedTracked: boolean;
  /** Adventure ids whose `adventure_started` was accepted (or catch-up succeeded). */
  startedAdventureIds: string[];
  /** Adventure ids whose `adventure_completed` was accepted (or catch-up succeeded). */
  completedAdventureIds: string[];
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
  startedAdventureIds: [],
  completedAdventureIds: [],
});

function pushId(ids: string[], id: string): string[] {
  if (ids.includes(id)) return ids;
  return [...ids, id].slice(-ADVENTURE_ACK_CAP);
}

function idList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string").slice(-ADVENTURE_ACK_CAP);
}

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
    // Leave empty so screen catch-up can still send adventure_started / adventure_completed once.
    startedAdventureIds: [],
    completedAdventureIds: [],
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
    startedAdventureIds: idList(value.startedAdventureIds),
    completedAdventureIds: idList(value.completedAdventureIds),
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

/** Record that adventure_started was delivered for this id (reducer path or catch-up). */
export function ackAdventureStarted(id: string): void {
  const current = getMilestones();
  if (current.startedAdventureIds.includes(id)) return;
  setMilestones({ ...current, startedAdventureIds: pushId(current.startedAdventureIds, id) });
}

/** Record that adventure_completed was delivered for this id. */
export function ackAdventureCompleted(id: string): void {
  const current = getMilestones();
  if (current.completedAdventureIds.includes(id)) return;
  setMilestones({ ...current, completedAdventureIds: pushId(current.completedAdventureIds, id) });
}

function delivered(name: "adventure_started" | "adventure_completed" | "first_adventure_started" | "first_adventure_completed", once: string, accepted: boolean): boolean {
  return accepted || hasTracked(name, once);
}

function maybeFirstStarted(id: string): void {
  const current = getMilestones();
  if (current.firstAdventureStartedTracked) return;
  const once = `first-start:${id}`;
  const accepted = trackEvent({ name: "first_adventure_started" }, once);
  if (delivered("first_adventure_started", once, accepted)) markMilestoneSent("firstAdventureStartedTracked");
}

function maybeFirstCompleted(id: string): void {
  const current = getMilestones();
  if (current.firstAdventureCompletedTracked) return;
  const once = `first-done:${id}`;
  const accepted = trackEvent({ name: "first_adventure_completed" }, once);
  if (delivered("first_adventure_completed", once, accepted)) markMilestoneSent("firstAdventureCompletedTracked");
}

/**
 * Ensure adventure_started reached Umami at most once per adventure id.
 * Returns true when acked (already or newly); false when Umami is not ready yet (caller may retry).
 */
export function ensureAdventureStarted(adventure: Pick<Adventure, "id" | "items">): boolean {
  const id = adventure.id;
  const current = getMilestones();
  if (current.startedAdventureIds.includes(id)) return true;
  const accepted = trackEvent({ name: "adventure_started", data: { item_count: adventure.items.length } }, id);
  if (!delivered("adventure_started", id, accepted)) return false;
  ackAdventureStarted(id);
  maybeFirstStarted(id);
  return true;
}

/**
 * Ensure adventure_completed reached Umami at most once per adventure id.
 * Sends adventure_started first when that ack is still missing.
 */
export function ensureAdventureCompleted(adventure: Pick<Adventure, "id" | "items">): boolean {
  const id = adventure.id;
  if (!ensureAdventureStarted(adventure)) return false;
  const current = getMilestones();
  if (current.completedAdventureIds.includes(id)) return true;
  const completed_missions = adventure.items.filter((item) => item.mission?.status === "done").length;
  const accepted = trackEvent(
    { name: "adventure_completed", data: { item_count: adventure.items.length, completed_missions } },
    id,
  );
  if (!delivered("adventure_completed", id, accepted)) return false;
  ackAdventureCompleted(id);
  maybeFirstCompleted(id);
  return true;
}
