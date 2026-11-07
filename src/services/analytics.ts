import type { CategoryId } from "../domain/types";

export type AddMethod = "catalog" | "manual" | "paste" | "photo" | "barcode" | "saved" | "custom";
export type RecognitionSource = "openai" | "open_food_facts" | "web_search" | "cache" | "my_products";

/** Only fixed names, fixed values and counts: never product names, EANs, list names or photos. */
export type AnalyticsEvent =
  | { name: "shopping_list_created" }
  | { name: "product_added"; data: { method: AddMethod; category: CategoryId } }
  | { name: "product_recognized"; data: { method: "photo" | "barcode"; source: RecognitionSource } }
  | { name: "adventure_started"; data: { item_count: number } }
  | { name: "adventure_completed"; data: { item_count: number; completed_missions: number } }
  | { name: "bonus_mission_completed"; data: { choice: "alternative" | "original" } }
  | { name: "offer_opened"; data: { retailer: "jumbo" | "ah" | "lidl"; match_type: "exact" | "likely" } };

export type Tracked = { event: AnalyticsEvent; once?: string };

/** Keys of events already sent in this page session; kept in memory only. */
const sent = new Set<string>();

/** Sends one event to Umami when the tracker is there; never throws, never retries. */
export function trackEvent(event: AnalyticsEvent, once?: string): void {
  try {
    const umami = typeof window === "undefined" ? undefined : window.umami;
    if (!umami || typeof umami.track !== "function") return;
    if (once !== undefined) {
      const key = `${event.name}|${once}`;
      if (sent.has(key)) return;
      sent.add(key);
    }
    const result = "data" in event ? umami.track(event.name, event.data) : umami.track(event.name);
    if (result instanceof Promise) result.catch(() => undefined);
  } catch {
    // Analytics must never get in the way of the app.
  }
}

/** For tests only. */
export function resetTracking(): void {
  sent.clear();
}
