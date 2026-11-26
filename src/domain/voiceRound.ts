/**
 * What Karrie says when a product is found.
 * The ending is chosen here, at the found instant, and is never queued behind praise.
 */

export type PraiseState = {
  /** Finds since the last praise, not counting a find that was itself praise. */
  findsSincePraise: number;
  lastWasPraise: boolean;
};

export const INITIAL_PRAISE_STATE: PraiseState = { findsSincePraise: 0, lastWasPraise: false };

export type FoundVoiceLine = "celebration" | "praise" | "none";

export type FoundVoicePlan = {
  line: FoundVoiceLine;
  /** Always the found instant: no animation delay and no later screen. */
  at: "found";
  delayMs: 0;
  praise: PraiseState;
};

/**
 * Praise on roughly one find in three, never twice in a row, and never on the last item.
 * After two skipped finds the next one is praise, so the gap stays within 2–3 finds.
 * `random` is in [0, 1).
 */
export function planFoundVoice(state: PraiseState, input: { isLast: boolean; random: number }): FoundVoicePlan {
  if (input.isLast) {
    return { line: "celebration", at: "found", delayMs: 0, praise: { findsSincePraise: 0, lastWasPraise: false } };
  }
  if (state.lastWasPraise) {
    return { line: "none", at: "found", delayMs: 0, praise: { findsSincePraise: 1, lastWasPraise: false } };
  }
  const speak = state.findsSincePraise >= 2 || input.random < 1 / 3;
  if (speak) {
    return { line: "praise", at: "found", delayMs: 0, praise: { findsSincePraise: 0, lastWasPraise: true } };
  }
  return {
    line: "none",
    at: "found",
    delayMs: 0,
    praise: { findsSincePraise: state.findsSincePraise + 1, lastWasPraise: false },
  };
}
