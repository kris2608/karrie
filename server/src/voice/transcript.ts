/** Dutch number words ↔ digits for transcript validation. */
const NUMBER_WORDS: Record<string, string> = {
  twee: "2",
  drie: "3",
  vier: "4",
  vijf: "5",
  zes: "6",
  zeven: "7",
  acht: "8",
  negen: "9",
  tien: "10",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
};

const PARTICLES = new Set(["de", "het", "een", "en", "of", "te", "van", "voor", "op", "in", "naar", "nog", "maar", "al", "je", "jij"]);

/** Normalize punctuation/spaces and map Dutch number words to digits. */
export function normalizeTranscript(text: string): string {
  let out = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[…]/g, "...")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  out = out
    .split(" ")
    .map((token) => NUMBER_WORDS[token] ?? token)
    .join(" ");
  return out;
}

function tokens(text: string): string[] {
  return normalizeTranscript(text).split(" ").filter(Boolean);
}

/**
 * Strict match: token sets must agree beyond allowed particles.
 * Rejects substring/padded speech that the old 85% rule accepted.
 */
export function transcriptsMatch(intended: string, spoken: string | undefined | null): boolean {
  if (!spoken) return false;
  const a = tokens(intended);
  const b = tokens(spoken);
  if (!a.length || !b.length) return false;

  const aJoined = a.join(" ");
  const bJoined = b.join(" ");
  if (aJoined === bJoined) return true;

  const contentA = new Set(a.filter((t) => !PARTICLES.has(t)));
  const contentB = new Set(b.filter((t) => !PARTICLES.has(t)));
  if (!contentA.size || !contentB.size) return false;

  let missing = 0;
  for (const token of contentA) {
    if (!contentB.has(token)) missing += 1;
  }
  let extra = 0;
  for (const token of contentB) {
    if (!contentA.has(token)) extra += 1;
  }

  // Allow at most one particle-adjacent slip; reject incomplete or padded content words.
  if (missing > 0 || extra > 1) return false;
  // Length: spoken must cover intended content (no truncated speech).
  if (b.length < a.length - 1) return false;
  return true;
}
