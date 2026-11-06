import type { CategoryId } from "./types";

export const CATEGORIES: { id: CategoryId; label: string; short: string }[] = [
  { id: "produce", label: "Groente en fruit", short: "Groente" },
  { id: "bakery", label: "Bakkerij", short: "Bakker" },
  { id: "pantry", label: "Houdbaar", short: "Houdbaar" },
  { id: "dairy", label: "Koeling en zuivel", short: "Koeling" },
  { id: "frozen", label: "Diepvries", short: "Vries" },
  { id: "household", label: "Huishouden", short: "Huis" },
];

export const DEFAULT_CATEGORY_ORDER: CategoryId[] = CATEGORIES.map((category) => category.id);

export function categoryLabel(id: CategoryId): string {
  return CATEGORIES.find((category) => category.id === id)?.label ?? id;
}
