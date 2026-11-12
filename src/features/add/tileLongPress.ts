/** What a long-press on an add-screen tile should do. Catalog products are never deleted. */
export type TileLongPress = "decrement" | "remove-from-list" | "confirm-forget" | "nothing";

/**
 * Leaving the shopping list never asks. A confirm is only for deleting a user product
 * from Mijn producten, which is when it is not on the list. Catalog tiles never forget the product.
 */
export function tileLongPress(mine: boolean, quantity: number): TileLongPress {
  if (quantity > 1) return "decrement";
  if (quantity === 1) return "remove-from-list";
  return mine ? "confirm-forget" : "nothing";
}
