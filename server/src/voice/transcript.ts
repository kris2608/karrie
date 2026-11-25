/** Loose compare so Realtime transcripts with punctuation still count as a match. */
export function normalizeTranscript(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[…]/g, "...")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function transcriptsMatch(intended: string, spoken: string | undefined | null): boolean {
  if (!spoken) return false;
  const a = normalizeTranscript(intended);
  const b = normalizeTranscript(spoken);
  if (!a || !b) return false;
  if (a === b) return true;
  // Allow minor filler words Realtime sometimes adds at the edges.
  if (a.includes(b) || b.includes(a)) {
    const longer = a.length >= b.length ? a : b;
    const shorter = a.length >= b.length ? b : a;
    return shorter.length / longer.length >= 0.85;
  }
  return false;
}
