import type { RetailerId } from "./retailers";
import type { CategoryId } from "./types";

export const CATEGORIES: { id: CategoryId; label: string; short: string }[] = [
  { id: "produce", label: "Groente en fruit", short: "Groente" },
  { id: "bakery", label: "Bakkerij", short: "Bakker" },
  { id: "meat", label: "Vlees, vis en vega", short: "Vlees" },
  { id: "breakfast", label: "Ontbijt en broodbeleg", short: "Ontbijt" },
  { id: "deli", label: "Kaas en vleeswaren", short: "Kaas" },
  { id: "dairy", label: "Zuivel en eieren", short: "Zuivel" },
  { id: "snacks", label: "Snacks en snoep", short: "Snack" },
  { id: "pantry", label: "Houdbaar", short: "Houdbaar" },
  { id: "meals", label: "Maaltijden en salades", short: "Maaltijd" },
  { id: "drinks", label: "Dranken", short: "Drank" },
  { id: "frozen", label: "Diepvries", short: "Vries" },
  { id: "care", label: "Verzorging", short: "Zorg" },
  { id: "household", label: "Huishouden", short: "Huis" },
];

export const DEFAULT_CATEGORY_ORDER: CategoryId[] = CATEGORIES.map((category) => category.id);

/** Typical walk order for Dutch supermarket layouts; parents can still customize. */
export const RETAILER_CATEGORY_ORDERS: Record<RetailerId, CategoryId[]> = {
  albert_heijn: [
    "produce",
    "bakery",
    "meat",
    "deli",
    "dairy",
    "breakfast",
    "pantry",
    "snacks",
    "meals",
    "drinks",
    "frozen",
    "care",
    "household",
  ],
  jumbo: [
    "produce",
    "bakery",
    "meat",
    "breakfast",
    "deli",
    "dairy",
    "meals",
    "pantry",
    "snacks",
    "drinks",
    "frozen",
    "household",
    "care",
  ],
  lidl: [
    "produce",
    "bakery",
    "meat",
    "dairy",
    "deli",
    "breakfast",
    "pantry",
    "snacks",
    "meals",
    "drinks",
    "frozen",
    "care",
    "household",
  ],
};

const KNOWN = new Set<string>(DEFAULT_CATEGORY_ORDER);

export function orderForRetailer(retailer: RetailerId | null | undefined): CategoryId[] {
  if (retailer && RETAILER_CATEGORY_ORDERS[retailer]) return mergeCategoryOrder(RETAILER_CATEGORY_ORDERS[retailer]);
  return [...DEFAULT_CATEGORY_ORDER];
}

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === "string" && KNOWN.has(value);
}

/** Keeps a stored order when possible, drops unknown ids, and appends any new departments. */
export function mergeCategoryOrder(stored: unknown): CategoryId[] {
  const kept = Array.isArray(stored) ? stored.filter(isCategoryId) : [];
  const seen = new Set(kept);
  return [...kept, ...DEFAULT_CATEGORY_ORDER.filter((id) => !seen.has(id))];
}

export function categoryLabel(id: CategoryId): string {
  return CATEGORIES.find((category) => category.id === id)?.label ?? id;
}
