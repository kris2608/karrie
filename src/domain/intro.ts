import type { AppState } from "../state/reducer";

/** Only a device that has never used Karrie gets "Hoe werkt Karrie?" before its first adventure. */
export function needsIntro(state: Pick<AppState, "adventure" | "saved" | "stickers" | "mine" | "settings">): boolean {
  if (state.settings.introSeen) return false;
  if (state.saved.length || state.stickers.length || state.mine.length) return false;
  const adventure = state.adventure;
  return !adventure || (adventure.phase === "draft" && adventure.items.length === 0);
}
