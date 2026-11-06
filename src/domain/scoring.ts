import type { AdventureItem, ScanResult } from "./types";

export const SCORING = { found: 1, exactScanBonus: 2, confirmedScanBonus: 2 };

export function scanBonus(scan?: ScanResult): number {
  if (scan === "verified") return SCORING.exactScanBonus;
  if (scan === "confirmed") return SCORING.confirmedScanBonus;
  return 0;
}

export function awardedStars(scan?: ScanResult): number {
  return SCORING.found + scanBonus(scan);
}

export function itemStars(item: AdventureItem): number {
  if (item.status !== "found") return 0;
  return item.stars ?? SCORING.found;
}

export function starTotal(items: AdventureItem[]): number {
  return items.reduce((total, item) => total + itemStars(item), 0);
}
