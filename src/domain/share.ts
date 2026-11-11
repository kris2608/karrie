import type { RetailerId } from "./retailers";

/** The public site parents send to friends; never a list or local data. */
export const SHARE_URL = "https://www.karrie.eu";
export const SHARE_TITLE = "Karrie";
export const SHARE_TEXT = "Speur, vind en vink af! Boodschappen doen als een avontuur.";
export const LIST_SHARE_TITLE = "Boodschappenlijstje";
export const LIST_SHARE_TEXT = "🛒 Ik heb een boodschappenlijstje met Karrie gemaakt!";

export type ListShareInfo = {
  name?: string;
  retailer?: RetailerId;
  itemCount: number;
};

/** Title and message for sharing a saved/current list — name and size only (no retailer in the message). */
export function listShareCopy(info: ListShareInfo): { title: string; text: string } {
  const count =
    info.itemCount > 0 ? (info.itemCount === 1 ? "1 product" : `${info.itemCount} producten`) : undefined;
  const bits = [info.name?.trim() || undefined, count].filter((part): part is string => Boolean(part));
  if (!bits.length) return { title: LIST_SHARE_TITLE, text: LIST_SHARE_TEXT };
  const summary = bits.join(" · ");
  return {
    title: info.name?.trim() || LIST_SHARE_TITLE,
    text: `${LIST_SHARE_TEXT} ${summary}`,
  };
}

export type ShareOutcome = "shared" | "copied" | "cancelled";

export type ShareDeps = {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  copy: (text: string) => Promise<void>;
};

function isAbort(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "name" in error && (error as { name: string }).name === "AbortError");
}

/** Opens the system share sheet when the device has one; otherwise copies the link. */
export async function shareLink(deps: ShareDeps, data: ShareData & { url: string }): Promise<ShareOutcome> {
  const can = deps.share && (!deps.canShare || deps.canShare(data));
  if (can && deps.share) {
    try {
      await deps.share(data);
      return "shared";
    } catch (error) {
      if (isAbort(error)) return "cancelled";
    }
  }
  await deps.copy(data.url);
  return "copied";
}

export function shareKarrie(deps: ShareDeps): Promise<ShareOutcome> {
  return shareLink(deps, { title: SHARE_TITLE, text: SHARE_TEXT, url: SHARE_URL });
}
