import type { CategoryId } from "./types";

/** "pakket" has no drawing of its own and falls back to the neutral box. */
export const CATEGORY_ICONS: Record<CategoryId, string> = {
  produce: "appel",
  bakery: "brood",
  meat: "gehakt",
  breakfast: "pindakaas",
  deli: "kaas",
  dairy: "melk",
  snacks: "chips",
  pantry: "pakket",
  meals: "kant-en-klaar",
  drinks: "water",
  frozen: "ijs",
  care: "shampoo",
  household: "handzeep",
};

export function categoryIcon(category: CategoryId): string {
  return CATEGORY_ICONS[category];
}
