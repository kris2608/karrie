/** Compose the approved prosody rate with the 20% faster delivery. */

export const SPEECH_TEMPO = 1.2;

/**
 * `+8%` at 1.2× tempo is 1.08 × 1.2 = 1.296, spoken as `+30%`.
 * Non-percentage rates (such as `fast`) are returned unchanged.
 */
export function composeSpeechRate(baseRate: string, tempo = SPEECH_TEMPO): string {
  const match = baseRate.trim().match(/^([+-]?\d+(?:\.\d+)?)%$/);
  if (!match) return baseRate.trim();
  const combined = (1 + Number(match[1]) / 100) * tempo;
  const percent = Math.round((combined - 1) * 100);
  return `${percent >= 0 ? "+" : ""}${percent}%`;
}
