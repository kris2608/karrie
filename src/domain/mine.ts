import { productById } from "../data/catalog";
import { singularKey } from "./customProduct";
import { normalize } from "./matchProduct";
import type { AdventureItem, SavedItem } from "./types";

/** "Mijn producten": products recognised from a photo or typed in by the parent, remembered on this device for later lists. */
export const MINE_LIMIT = 120;

/**
 * One entry per name and brand, so a new photo of the same pack replaces the old one.
 * A typed-in product keeps its id ("custom:walnoot"), which already joins singular and plural.
 */
export function mineKey(item: { name: string; brand?: string; kind?: string; productId?: string }): string {
  if (item.kind === "custom_generic" && item.productId) return `mine:${item.productId}`;
  return `mine:${normalize(item.name)}|${normalize(item.brand ?? "")}`;
}

/** Worth remembering: a scanned barcode, a branded pack, a typed-in product, or anything the catalog does not already have a tile for. */
export function worthRemembering(item: AdventureItem): boolean {
  if (item.ean || item.kind === "custom_generic") return true;
  const identified = item.source === "vision" || item.source === "off" || item.source === "barcode";
  return identified && (Boolean(item.brand) || !productById(item.productId));
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
  if (!needle || normalize(entry.name).includes(needle) || normalize(entry.brand ?? "").includes(needle)) return true;
  if (entry.aliases?.some((alias) => normalize(alias).includes(needle))) return true;
  return entry.kind === "custom_generic" && singularKey(entry.name) === singularKey(needle);
}
