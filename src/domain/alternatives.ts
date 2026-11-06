import type { AdventureItem, Nutrition } from "./types";

/**
 * Placeholder for healthier swaps. Rules for any future implementation:
 * an alternative must share the item's catalog groupId, is only ever a
 * suggestion to the parent, and is never applied without their approval.
 */
export type Alternative = {
  forItemId: AdventureItem["id"];
  ean: string;
  name: string;
  nutrition: Nutrition;
};

export function suggestAlternatives(): Alternative[] {
  return [];
}
