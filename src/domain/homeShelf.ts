import type { Adventure, SavedList } from "./types";

export type ShelfEntry = { list: SavedList; label: "Vorig lijstje" | "Bewaard" };

/** The previous list plus up to six favorites, newest first; saved is already ordered newest first. */
export function homeShelf(saved: SavedList[], adventure: Adventure | null | undefined): ShelfEntry[] {
  const previous = adventure?.phase === "done" ? saved[0] : saved.find((list) => list.id !== adventure?.id);
  const favoriteIds = new Set(saved.filter((list) => list.favorite && list.id !== previous?.id).slice(0, 6).map((list) => list.id));
  return saved
    .filter((list) => list.id === previous?.id || favoriteIds.has(list.id))
    .map((list) => ({ list, label: list.id === previous?.id ? "Vorig lijstje" : "Bewaard" }));
}
