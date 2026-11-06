import type { AdventureItem } from "./types";

export const SCORING = { found: 1, discoveryBonus: 2 };

/** Discovery stars count even when the parent keeps the original product. */
export function itemStars(item: AdventureItem): number {
  const found = item.status === "found" ? (item.stars ?? SCORING.found) : 0;
  return found + (item.mission?.stars ?? 0);
}

export function starTotal(items: AdventureItem[]): number {
  return items.reduce((total, item) => total + itemStars(item), 0);
}
