import { identityKey, identityOf, wantsReference, type ImageIdentity } from "./imageIdentity";
import type { Adventure } from "./types";

/**
 * Products on the current list to look up: every branded pack (its page facts are kept even when the parent pinned
 * a photo or drawing), and standard products a parent asked a picture for.
 */
export function wantedReferences(adventure: Adventure | null): ImageIdentity[] {
  if (!adventure || adventure.phase === "done") return [];
  const wanted = new Map<string, ImageIdentity>();
  for (const item of adventure.items) {
    const identity = identityOf(item);
    if (identity && (!identity.generic || wantsReference(identity, item.imageChoice))) wanted.set(identityKey(identity), identity);
  }
  return [...wanted.values()];
}
