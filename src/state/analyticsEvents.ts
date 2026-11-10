import type { AddMethod, RecognitionSource, Tracked } from "../services/analytics";
import { getMilestones, markMilestoneSent } from "../services/analyticsMilestones";
import type { BarcodeOutcome } from "../services/barcode/lookup";
import type { Action, AppState } from "./reducer";

/** Where a successful barcode lookup got its answer; null when the code did not identify a product. */
export function barcodeSource(outcome: BarcodeOutcome): RecognitionSource | null {
  if (outcome.status === "mine") return "my_products";
  if (outcome.status !== "found") return null;
  return outcome.lookupSource;
}

/** Source + outcome for barcode_lookup_result; null when there is nothing meaningful to report. */
export function barcodeLookupAnalytics(outcome: BarcodeOutcome): { source: RecognitionSource; outcome: "success" | "not_found" | "error" | "offline" | "rate_limited" } | null {
  if (outcome.status === "mine") return { source: "my_products", outcome: "success" };
  if (outcome.status === "found") return { source: outcome.lookupSource, outcome: "success" };
  if (outcome.status === "none") return { source: outcome.lookupSource ?? "device_cache", outcome: "not_found" };
  if (outcome.status === "offline") return { source: "device_cache", outcome: "offline" };
  if (outcome.status === "limit") return { source: "device_cache", outcome: "rate_limited" };
  if (outcome.status === "error") return { source: "device_cache", outcome: "error" };
  return null;
}

function addMethod(action: Action): AddMethod | null {
  switch (action.type) {
    case "add-product":
      return "catalog";
    case "add-lines":
      return "paste";
    case "add-mine":
      return "saved";
    case "add-recognized":
      return action.via ?? "manual";
    case "add-custom":
      return "custom";
    default:
      return null;
  }
}

/**
 * The analytics events one reducer step stands for. Only a new line counts as an added product; raising the
 * quantity of a line that is already there does not. Undo, opening a saved list and hydrating never count.
 */
export function analyticsEvents(action: Action, before: AppState, after: AppState): Tracked[] {
  const next = after.adventure;
  if (!next || before === after) return [];
  const previous = before.adventure;
  const events: Tracked[] = [];

  const method = addMethod(action);
  if (method) {
    const known = new Set(previous?.id === next.id ? previous.items.map((item) => item.id) : []);
    const added = next.items.filter((item) => !known.has(item.id));
    const fresh = !previous || previous.id !== next.id || previous.items.length === 0;
    if (added.length && fresh && next.phase === "draft") {
      events.push({ event: { name: "shopping_list_created" }, once: next.id });
      if (!getMilestones().firstListTracked) {
        events.push({ event: { name: "first_list_created" }, once: `first-list:${next.id}` });
      }
    }
    for (const item of added) events.push({ event: { name: "product_added", data: { method, category: item.category } } });
  }

  if (action.type === "start-shopping" && previous?.phase !== "shopping" && next.phase === "shopping") {
    events.push({ event: { name: "adventure_started", data: { item_count: next.items.length } }, once: next.id });
    if (!getMilestones().firstAdventureStartedTracked) {
      events.push({ event: { name: "first_adventure_started" }, once: `first-start:${next.id}` });
    }
  }

  if ((action.type === "found" || action.type === "mission-done") && previous?.phase === "shopping") {
    const previousFound = previous.items.filter((item) => item.status === "found").length;
    const nextFound = next.items.filter((item) => item.status === "found").length;
    if (previousFound === 0 && nextFound > 0) {
      events.push({ event: { name: "adventure_first_item_found", data: { item_count: next.items.length } }, once: `first-found:${next.id}` });
    }
  }

  if (action.type === "mission-done") {
    const done = next.items.find((item) => item.mission?.status === "done" && item.mission.kept === action.keep && !previous?.items.some((old) => old.id === item.id && old.mission?.status === "done"));
    if (done) events.push({ event: { name: "bonus_mission_completed", data: { choice: action.keep } }, once: `${next.id}:${done.id}` });
  }

  if (action.type === "mission-skip") {
    const skipped = previous?.items.find(
      (item) =>
        (item.mission?.status === "offered" || item.mission?.status === "active") &&
        next.items.some((entry) => entry.id === item.id && entry.mission?.status === "skipped"),
    );
    if (skipped) {
      events.push({ event: { name: "bonus_skipped", data: { kind: "healthier" } }, once: `bonus-skip:${next.id}:${skipped.id}:healthier` });
    }
  }

  if (action.type === "play-skip") {
    const skipped = previous?.items.find(
      (item) =>
        item.play &&
        (item.play.status === "offered" || item.play.status === "active") &&
        next.items.some((entry) => entry.id === item.id && entry.play?.status === "skipped"),
    );
    if (skipped?.play) {
      events.push({
        event: { name: "bonus_skipped", data: { kind: skipped.play.kind } },
        once: `bonus-skip:${next.id}:${skipped.id}:${skipped.play.kind}`,
      });
    }
  }

  if ((action.type === "found" || action.type === "mission-done") && previous?.phase === "shopping" && next.phase === "done") {
    const completed_missions = next.items.filter((item) => item.mission?.status === "done").length;
    events.push({ event: { name: "adventure_completed", data: { item_count: next.items.length, completed_missions } }, once: next.id });
    if (!getMilestones().firstAdventureCompletedTracked) {
      events.push({ event: { name: "first_adventure_completed" }, once: `first-done:${next.id}` });
    }
  }

  if ((action.type === "save-favorite" || action.type === "save-favorite-as-new") && next.items.length) {
    const wasFavorite = action.type === "save-favorite" && before.saved.some((list) => list.id === next.id && list.favorite);
    // Repeatable: each explicit save counts. Action-instance key avoids StrictMode double-accept without collapsing updates.
    events.push({
      event: { name: "shopping_list_saved", data: { action: wasFavorite ? "updated" : "new" } },
      once: `save:${action.type}:${next.id}:${next.updatedAt}:${wasFavorite ? "u" : "n"}`,
    });
  }

  if (action.type === "open-saved") {
    events.push({
      event: { name: "saved_list_reopened" },
      once: `open:${action.id}:${next.id}:${next.updatedAt}`,
    });
  }

  return events;
}

/** Flip lifetime first-* flags only for events that were actually sent. */
export function commitMilestoneEvents(events: Tracked[], sent: boolean[]): void {
  events.forEach((entry, index) => {
    if (!sent[index]) return;
    if (entry.event.name === "first_list_created") markMilestoneSent("firstListTracked");
    if (entry.event.name === "first_adventure_started") markMilestoneSent("firstAdventureStartedTracked");
    if (entry.event.name === "first_adventure_completed") markMilestoneSent("firstAdventureCompletedTracked");
  });
}
