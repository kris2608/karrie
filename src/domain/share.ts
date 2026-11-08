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
