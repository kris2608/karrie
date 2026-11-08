/** The Tally form parents fill in; only the `source` query is added. */
export const FEEDBACK_FORM = "https://tally.so/r/RWdkDj";
export const FEEDBACK_PRIVACY = "https://tally.so/help/privacy";

export type FeedbackSource = "settings" | "completed";

export function feedbackUrl(source: FeedbackSource): string {
  return `${FEEDBACK_FORM}?source=${source}`;
}

/** After two distinct finished adventures, invite once until the parent answers. */
export function wantsFeedbackInvite(completed: string[], asked: boolean): boolean {
  return !asked && completed.length >= 2;
}

/** Remembers that this adventure finished; undoing does not remove the id. */
export function rememberCompleted(completed: string[], adventureId: string): string[] {
  return completed.includes(adventureId) ? completed : [...completed, adventureId];
}
