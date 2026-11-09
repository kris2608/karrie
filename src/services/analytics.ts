import type { CategoryId } from "../domain/types";

export type AddMethod = "catalog" | "manual" | "paste" | "photo" | "barcode" | "saved" | "custom";
export type RecognitionSource = "openai" | "open_food_facts" | "web_search" | "cache" | "my_products";
export type ReturnBucket = "1" | "2-7" | "8-30" | "31+";
export type ScannerOutcome = "success" | "not_found" | "error" | "offline";
export type OnboardingAction = "start" | "skip" | "dismiss";
export type FeedbackSource = "settings" | "completed";

/** Only fixed names, fixed values and counts: never product names, EANs, list names or photos. */
export type AnalyticsEvent =
  | { name: "shopping_list_created" }
  | { name: "product_added"; data: { method: AddMethod; category: CategoryId } }
  | { name: "product_recognized"; data: { method: "photo" | "barcode"; source: RecognitionSource } }
  | { name: "adventure_started"; data: { item_count: number } }
  | { name: "adventure_completed"; data: { item_count: number; completed_missions: number } }
  | { name: "bonus_mission_completed"; data: { choice: "alternative" | "original" } }
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
  | { name: "shopping_list_shared"; data: { method: "whatsapp" | "copied" } }
  | { name: "shared_list_imported"; data: { item_count: number; entry: "link" | "unknown" } }
  | { name: "feedback_opened"; data: { source: FeedbackSource } }
  | { name: "sticker_book_opened" };

export type Tracked = { event: AnalyticsEvent; once?: string };

/** Keys of events already sent in this page session; kept in memory only. */
const sent = new Set<string>();

/**
 * Sends one event to Umami when the tracker is there; never throws, never retries.
 * Returns true only when umami.track was invoked (so milestone flags can wait for a real send).
 */
export function trackEvent(event: AnalyticsEvent, once?: string): boolean {
  try {
    const umami = typeof window === "undefined" ? undefined : window.umami;
    if (!umami || typeof umami.track !== "function") return false;
    if (once !== undefined) {
      const key = `${event.name}|${once}`;
      if (sent.has(key)) return true;
      sent.add(key);
    }
    const result = "data" in event ? umami.track(event.name, event.data) : umami.track(event.name);
    if (result instanceof Promise) result.catch(() => undefined);
    return true;
  } catch {
    // Analytics must never get in the way of the app.
    return false;
  }
}

/** For tests only. */
export function resetTracking(): void {
  sent.clear();
}
