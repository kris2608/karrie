import type { CategoryId } from "./types";

/** "pakket" has no drawing of its own and falls back to the neutral box. */
export const CATEGORY_ICONS: Record<CategoryId, string> = {
  produce: "appel",
  bakery: "brood",
  pantry: "pakket",
  dairy: "melk",
  frozen: "ijs",
  household: "handzeep",
};

export function categoryIcon(category: CategoryId): string {
  return CATEGORY_ICONS[category];
}
