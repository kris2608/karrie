import { productById } from "../data/catalog";
import { identityKey, identityOf, type ImageIdentity } from "./imageIdentity";
import type { Adventure } from "./types";

/** Products on the current list that may show a reference picture, plus the products their bonus missions point to. */
export function wantedReferences(adventure: Adventure | null): ImageIdentity[] {
  if (!adventure || adventure.phase === "done") return [];
  const wanted = new Map<string, ImageIdentity>();
  const add = (identity: ImageIdentity | null) => identity && wanted.set(identityKey(identity), identity);
  for (const item of adventure.items) {
    if (item.imageChoice !== "photo" && item.imageChoice !== "drawing") add(identityOf(item));
    const target = item.alternative?.status === "possible" && item.alternative.targetType ? productById(item.alternative.targetType) : undefined;
    if (target) add({ name: target.name, generic: true });
  }
  return [...wanted.values()];
}
