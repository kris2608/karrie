/** Mirrors client `voiceScripts` allowlist — keep in sync when templates change. */

const STATIC = new Set([
  // Welcome
  "Hoi! Zullen we samen boodschappen doen?",
  "Ben je klaar voor ons boodschappenavontuur?",
  "Kom, we gaan op zoek naar de boodschappen!",
  // Positive
  "Hebbes!",
  "Ja hoor!",
  "Gevonden!",
  "Die mag in ons wagentje!",
  "Kijk eens aan!",
  "Ja, die hebben we!",
  "Goed gedaan!",
  "Dat is hem!",
  "Helemaal goed!",
  // Incorrect
  "Oeps, die zoeken we nog niet.",
  "Bijna! Kijk nog eens goed.",
  "Dat is iets anders. Probeer het nog maar eens.",
  // Encouragement / final
  "Wat zijn we goed bezig!",
  "We zijn al een heel eind!",
  "Nog een paar boodschappen!",
  "Nog eentje te gaan!",
  // Complete / sticker
  "Gelukt! Alle boodschappen zijn gevonden.",
  "Wat heb jij goed geholpen vandaag!",
  "Ons boodschappenavontuur zit erop!",
  "Tadaa! Dat hebben we samen mooi gedaan!",
  "Kijk, je hebt een nieuwe sticker verdiend!",
  "Er is een nieuwe sticker voor jouw stickerboek!",
  // Mission / play (never reveal guess answers)
  "Psst… ik heb een speciale opdracht voor je!",
  "Ik heb een bonusmissie!",
  "Zoek de bonus!",
  "Sleep naar Karrie!",
  "Raad het product!",
]);

/** Product / quantity / article-free patterns. Captured groups must stay short product names. */
const DYNAMIC_PATTERNS = [
  /^Hmm… waar zouden (.+) zijn\?$/,
  /^Hmm… waar zou (.+) zijn\?$/,
  /^Zo, nu nog (.+)!$/,
  /^(.+)! Zie jij .+ al\?$/,
  /^Kun jij (.+) vinden\?$/,
  /^Op zoek naar (.+)!$/,
  /^Nu gaan we (.+) zoeken!$/,
  /^Waar is (?:de|het) (.+)\?$/,
  /^Waar is (.+)\?$/,
  /^We hebben .+ (.+) nodig\.$/,
  /^Zoek iets .+!$/,
  /^Nog eentje: (.+)!$/,
];

const MAX_SPOKEN_NAME = 40;
const MAX_TEXT = 140;

export const VOICE_EVENTS = [
  "welcome",
  "product",
  "positive",
  "incorrect",
  "encouragement",
  "complete",
  "sticker",
  "mission",
  "play",
] as const;
export type VoiceEvent = (typeof VOICE_EVENTS)[number];

export function isVoiceEvent(value: unknown): value is VoiceEvent {
  return typeof value === "string" && (VOICE_EVENTS as readonly string[]).includes(value);
}

export function isAllowedSpeechText(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > MAX_TEXT) return false;
  if (STATIC.has(trimmed)) return true;
  for (const pattern of DYNAMIC_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const name = (match[1] ?? "").trim();
    if (name && (name.length > MAX_SPOKEN_NAME || /[<>{}[\]\\]|https?:/i.test(name))) return false;
    return true;
  }
  return false;
}

export function normalizeSpeechKey(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}
