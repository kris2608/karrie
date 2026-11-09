import { products } from "../data/catalog";
import { customName, nameTaken, suggestion } from "./customProduct";
import { normalize } from "./matchProduct";
import type { Product, SavedItem } from "./types";

/** Catalog products whose name or alias contains the search needle (substring). */
export function catalogMatches(query: string, list: Product[] = products): Product[] {
  const needle = normalize(query);
  if (!needle) return list;
  return list.filter(
    (product) => normalize(product.name).includes(needle) || product.aliases.some((alias) => normalize(alias).includes(needle)),
  );
}

/** Non-typo catalog product that already covers this query (exact, alias, or singular/plural). */
export function pinnedCatalogGeneric(query: string, mine: SavedItem[] = []): Product | null {
  const hit = suggestion(query, mine);
  return hit?.kind === "catalog" && !hit.close ? hit.product : null;
}

/**
 * Custom "Voeg … toe" label when the query is not already a known catalog generic.
 * Typo-only suggestions still allow custom so parents can insist on what they typed.
 */
export function customAddLabel(query: string, mine: SavedItem[], occupiedNames: string[]): string | null {
  if (pinnedCatalogGeneric(query, mine)) return null;
  if (nameTaken(query, occupiedNames)) return null;
  return customName(query);
}

/**
 * Search catalog order: suggestion first (exact, alias, plural, or typo), then other substring hits.
 * Typo pins still allow Voeg toe; only non-typo pins get the generic subtitle via `pinnedCatalogGeneric`.
 */
export function orderedCatalogResults(query: string, mine: SavedItem[] = [], list: Product[] = products): Product[] {
  const visible = catalogMatches(query, list);
  const hit = suggestion(query, mine);
  const pin = hit?.kind === "catalog" ? hit.product : null;
  if (!pin) return visible;
  return [pin, ...visible.filter((product) => product.id !== pin.id)];
}
