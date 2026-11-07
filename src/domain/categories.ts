import type { CategoryId } from "./types";

export const CATEGORIES: { id: CategoryId; label: string; short: string }[] = [
  { id: "produce", label: "Groente en fruit", short: "Groente" },
  { id: "bakery", label: "Bakkerij", short: "Bakker" },
  { id: "meat", label: "Vlees, vis en vega", short: "Vlees" },
  { id: "breakfast", label: "Ontbijt en broodbeleg", short: "Ontbijt" },
  { id: "pantry", label: "Houdbaar", short: "Houdbaar" },
  { id: "dairy", label: "Zuivel", short: "Zuivel" },
  { id: "drinks", label: "Dranken", short: "Drank" },
  { id: "frozen", label: "Diepvries", short: "Vries" },
  { id: "household", label: "Huishouden", short: "Huis" },
];

export const DEFAULT_CATEGORY_ORDER: CategoryId[] = CATEGORIES.map((category) => category.id);

const KNOWN = new Set<string>(DEFAULT_CATEGORY_ORDER);

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
