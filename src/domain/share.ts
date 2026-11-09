/** The public site parents send to friends; never a list or local data. */
export const SHARE_URL = "https://www.karrie.eu";
export const SHARE_TITLE = "Karrie";
export const SHARE_TEXT = "Speur, vind en vink af! Boodschappen doen als een avontuur.";

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
export async function shareKarrie(deps: ShareDeps): Promise<ShareOutcome> {
  const data: ShareData = { title: SHARE_TITLE, text: SHARE_TEXT, url: SHARE_URL };
  const can = deps.share && (!deps.canShare || deps.canShare(data));
  if (can && deps.share) {
    try {
      await deps.share(data);
      return "shared";
    } catch (error) {
      if (isAbort(error)) return "cancelled";
    }
  }
  await deps.copy(SHARE_URL);
  return "copied";
}

export const SHARE_LIST_TITLE = "Boodschappenlijstje van Karrie";
export const SHARE_LIST_TEXT =
  "Hier is een boodschappenlijstje via Karrie. Open de link om het te bekijken. De link bevat de productnamen en aantallen.";

/**
 * Share a shopping-list URL (including `#list=`). Cancel stays `"cancelled"`.
 * Copy fallback copies the full URL with hash. Some apps may strip fragments.
 */
export async function shareShoppingList(url: string, deps: ShareDeps): Promise<ShareOutcome> {
  const data: ShareData = { title: SHARE_LIST_TITLE, text: SHARE_LIST_TEXT, url };
  const can = deps.share && (!deps.canShare || deps.canShare(data));
  if (can && deps.share) {
    try {
      await deps.share(data);
      return "shared";
    } catch (error) {
      if (isAbort(error)) return "cancelled";
    }
  }
  await deps.copy(url);
  return "copied";
}
