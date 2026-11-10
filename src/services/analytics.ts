import type { CategoryId } from "../domain/types";

export type AddMethod = "catalog" | "manual" | "paste" | "photo" | "barcode" | "saved" | "custom";
/** Provenance for recognition / barcode events. `cache` kept for historical continuity with older dashboards. */
export type RecognitionSource =
  | "openai"
  | "open_food_facts"
  | "web_search"
  | "cache"
  | "device_cache"
  | "server_cache"
  | "postgres"
  | "prijsprofeet"
  | "my_products";
export type BarcodeLookupSource = Exclude<RecognitionSource, "openai" | "cache">;
export type BarcodeLookupOutcome = "success" | "not_found" | "error" | "offline" | "rate_limited";
export type ReturnBucket = "1" | "2-7" | "8-30" | "31+";
export type ScannerOutcome = "success" | "not_found" | "error" | "offline";
export type OnboardingAction = "start" | "skip" | "dismiss";
export type FeedbackSource = "settings" | "completed";
export type BonusKind = "healthier" | "guess" | "color" | "drag";
export type SharedListOpenOutcome = "preview" | "expired" | "invalid" | "network_error";
export type ProductImageSource = "store" | "name" | "reference" | "private_label";
export type ProductImageOutcome = "found" | "not_found" | "error";
export type StorageOperation = "load" | "save" | "photo";
export type StorageFailureReason = "unavailable" | "read_failed" | "write_failed" | "quota";

/** Only fixed names, fixed values and counts: never product names, EANs, list names or photos. */
export type AnalyticsEvent =
  | { name: "shopping_list_created" }
  | { name: "product_added"; data: { method: AddMethod; category: CategoryId } }
  | { name: "product_recognized"; data: { method: "photo" | "barcode"; source: RecognitionSource } }
  | { name: "barcode_lookup_result"; data: { source: BarcodeLookupSource; outcome: BarcodeLookupOutcome } }
  | { name: "adventure_started"; data: { item_count: number } }
  | { name: "adventure_first_item_found"; data: { item_count: number } }
  | { name: "adventure_resumed"; data: { phase: "draft" | "shopping" } }
  | { name: "adventure_completed"; data: { item_count: number; completed_missions: number } }
  | { name: "bonus_offered"; data: { kind: BonusKind } }
  | { name: "bonus_skipped"; data: { kind: BonusKind } }
  | { name: "bonus_mission_completed"; data: { choice: "alternative" | "original" } }
  | { name: "bonus_play_completed"; data: { kind: "guess" | "color" | "drag" } }
  | { name: "offer_opened"; data: { retailer: "jumbo" | "ah" | "lidl"; match_type: "exact" | "likely" } }
  | { name: "app_first_open" }
  | { name: "new_adventure_clicked" }
  | { name: "onboarding_opened" }
  | { name: "onboarding_finished"; data: { action: OnboardingAction } }
  | { name: "first_list_created" }
  | { name: "first_adventure_started" }
  | { name: "first_adventure_completed" }
  | { name: "app_returned"; data: { days_since_last_open: ReturnBucket } }
  | { name: "shopping_list_saved"; data: { action: "new" | "updated" } }
  | { name: "saved_list_reopened" }
  | { name: "scanner_opened" }
  | { name: "scanner_result"; data: { method: "barcode" | "photo"; outcome: ScannerOutcome } }
  | { name: "share_completed"; data: { method: "native" | "copied" } }
  | { name: "shopping_list_share_opened" }
  | { name: "shopping_list_shared"; data: { method: "native" | "copied" } }
  | { name: "shared_list_open_result"; data: { outcome: SharedListOpenOutcome } }
  | { name: "shared_list_imported"; data: { item_count: number; entry: "link" | "unknown" } }
  | { name: "product_image_result"; data: { source: ProductImageSource; outcome: ProductImageOutcome } }
  | { name: "storage_operation_failed"; data: { operation: StorageOperation; reason: StorageFailureReason } }
  | { name: "feedback_opened"; data: { source: FeedbackSource } }
  | { name: "sticker_book_opened" };

export type Tracked = { event: AnalyticsEvent; once?: string };

/** Keys of events already sent in this page session; kept in memory only. */
const sent = new Set<string>();

type Queued = { event: AnalyticsEvent; once?: string; at: number };

const BUFFER_CAP = 20;
const BUFFER_TTL_MS = 5_000;
const queue: Queued[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function invoke(umami: { track: (name: string, data?: Record<string, string | number>) => unknown }, event: AnalyticsEvent): boolean {
  try {
    const result = "data" in event ? umami.track(event.name, event.data as Record<string, string | number>) : umami.track(event.name);
    if (result instanceof Promise) result.catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

function flushQueue(): void {
  const umami = typeof window === "undefined" ? undefined : window.umami;
  if (!umami || typeof umami.track !== "function") return;
  const now = Date.now();
  const pending = queue.splice(0, queue.length);
  for (const item of pending) {
    if (now - item.at > BUFFER_TTL_MS) continue;
    if (item.once !== undefined) {
      const key = `${item.event.name}|${item.once}`;
      if (sent.has(key)) continue;
      sent.add(key);
    }
    invoke(umami, item.event);
  }
}

function scheduleFlush(): void {
  if (flushTimer !== undefined) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    flushQueue();
    if (queue.length) scheduleFlush();
  }, 250);
}

/**
 * Asks Umami to accept one event. Returns true only when the tracker accepted this invoke
 * (not when a once-key duplicate is skipped, and not when a Promise later rejects).
 * Brief in-memory buffer only until the tracker appears; never persists across sessions.
 */
export function trackEvent(event: AnalyticsEvent, once?: string): boolean {
  try {
    if (typeof window === "undefined") return false;
    const umami = window.umami;
    if (!umami || typeof umami.track !== "function") {
      if (queue.length >= BUFFER_CAP) queue.shift();
      queue.push({ event, once, at: Date.now() });
      scheduleFlush();
      return false;
    }
    flushQueue();
    if (once !== undefined) {
      const key = `${event.name}|${once}`;
      if (sent.has(key)) return false;
      sent.add(key);
    }
    return invoke(umami, event);
  } catch {
    // Analytics must never get in the way of the app.
    return false;
  }
}

/** For tests only. */
export function resetTracking(): void {
  sent.clear();
  queue.length = 0;
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
}
