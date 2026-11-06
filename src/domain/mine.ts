import { productById } from "../data/catalog";
import { normalize } from "./matchProduct";
import type { AdventureItem, SavedItem } from "./types";

/** "Mijn producten": products recognised from a photo, remembered on this device for later lists. */
export const MINE_LIMIT = 120;

/** One entry per name and brand, so a new photo of the same pack replaces the old one. */
export function mineKey(item: { name: string; brand?: string }): string {
  return `mine:${normalize(item.name)}|${normalize(item.brand ?? "")}`;
}

/** Worth remembering: a branded pack, or anything the catalog does not already have a tile for. */
export function worthRemembering(item: AdventureItem): boolean {
  return item.source === "vision" && (Boolean(item.brand) || !productById(item.productId));
}

export function mineEntry(item: AdventureItem): SavedItem {
  const { id: _id, status: _status, stars: _stars, scan: _scan, mission: _mission, quantity: _quantity, imageChoice: _choice, missionEnabled: _enabled, ...rest } = item;
  return { ...rest, quantity: 1 };
}

export function remember(mine: SavedItem[], item: AdventureItem): SavedItem[] {
  if (!worthRemembering(item)) return mine;
  const key = mineKey(item);
  return [mineEntry(item), ...mine.filter((entry) => mineKey(entry) !== key)].slice(0, MINE_LIMIT);
}

export function matchesMine(entry: SavedItem, needle: string): boolean {
  return !needle || normalize(entry.name).includes(needle) || normalize(entry.brand ?? "").includes(needle);
}
