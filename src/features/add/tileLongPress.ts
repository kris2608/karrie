/** What a long-press on an add-screen tile should do. Catalog products are never deleted. */
export type TileLongPress = "decrement" | "remove-from-list" | "confirm-list" | "confirm-forget" | "nothing";

/**
 * User products (Mijn producten) confirm a delete only when they are not on the list.
 * At quantity 1 they leave the list with no dialog. Catalog tiles never forget the product.
 */
export function tileLongPress(mine: boolean, quantity: number): TileLongPress {
  if (quantity > 1) return "decrement";
  if (quantity === 1) return mine ? "remove-from-list" : "confirm-list";
  return mine ? "confirm-forget" : "nothing";
}
