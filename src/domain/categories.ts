import type { RetailerId } from "./retailers";
import type { CategoryId } from "./types";

/** Locked walk order for all lists while the parent reorder UI is hidden. */
export const CATEGORIES: { id: CategoryId; label: string; short: string }[] = [
  { id: "produce", label: "Groente en fruit", short: "Groente" },
  { id: "meals", label: "Maaltijden en salades", short: "Maaltijd" },
  { id: "meat", label: "Vlees, vis en vega", short: "Vlees" },
  { id: "deli", label: "Kaas en vleeswaren", short: "Kaas" },
  { id: "bakery", label: "Bakkerij", short: "Bakker" },
  { id: "breakfast", label: "Ontbijt en broodbeleg", short: "Ontbijt" },
  { id: "dairy", label: "Zuivel", short: "Zuivel" },
  { id: "pantry", label: "Houdbaar", short: "Houdbaar" },
  { id: "snacks", label: "Snacks en snoep", short: "Snack" },
  { id: "household", label: "Huishouden", short: "Huis" },
  { id: "care", label: "Verzorging", short: "Zorg" },
  { id: "drinks", label: "Dranken", short: "Drank" },
  { id: "frozen", label: "Diepvries", short: "Vries" },
];

export const DEFAULT_CATEGORY_ORDER: CategoryId[] = CATEGORIES.map((category) => category.id);

/** Same locked order for every supermarket while winkelvolgorde is hidden. */
export const RETAILER_CATEGORY_ORDERS: Record<RetailerId, CategoryId[]> = {
  albert_heijn: [...DEFAULT_CATEGORY_ORDER],
  jumbo: [...DEFAULT_CATEGORY_ORDER],
  lidl: [...DEFAULT_CATEGORY_ORDER],
};

const KNOWN = new Set<string>(DEFAULT_CATEGORY_ORDER);

export function orderForRetailer(_retailer?: RetailerId | null): CategoryId[] {
  return [...DEFAULT_CATEGORY_ORDER];
}

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === "string" && KNOWN.has(value);
}

/** Migrates any stored order to the locked default while the reorder UI is hidden. */
export function mergeCategoryOrder(_stored?: unknown): CategoryId[] {
  return [...DEFAULT_CATEGORY_ORDER];
}

export function categoryLabel(id: CategoryId): string {
  return CATEGORIES.find((category) => category.id === id)?.label ?? id;
}
