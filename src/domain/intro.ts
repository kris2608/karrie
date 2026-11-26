import type { AppState } from "../state/reducer";

/**
 * First-time home. Opening or dismissing the explanation does not count as use.
 * A visitor has used Karrie once they have a list with products, a saved list,
 * a custom product, a sticker, a completed hunt, or a hunt already in progress.
 */
export function needsIntro(state: Pick<AppState, "adventure" | "saved" | "stickers" | "mine" | "completedAdventures">): boolean {
  if (state.saved.length || state.stickers.length || state.mine.length || state.completedAdventures.length) return false;
  const adventure = state.adventure;
  if (!adventure) return true;
  if (adventure.phase !== "draft") return false;
  return adventure.items.length === 0;
}
