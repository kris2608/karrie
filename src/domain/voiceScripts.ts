import { spokenNameInSentence, spokenProductName } from "./spokenProductName";

export const VOICE_LANGUAGE = "nl-NL";
/** Bump when personality instructions or template wording change so caches refresh. */
export const VOICE_INSTRUCTION_VERSION = "v1";

export const VOICE_PERSONALITY =
  "Speak in natural Netherlands Dutch. You are Karrie, a friendly and playful shopping companion for young children. Speak warmly, clearly and conversationally, with a gentle smile in your voice. Use natural intonation and short pauses. Be encouraging but not overly enthusiastic. Avoid baby talk, exaggerated excitement and robotic delivery. Speak slightly slower than normal conversational speech.";

export type VoiceEvent =
  | "welcome"
  | "product"
  | "positive"
  | "incorrect"
  | "encouragement"
  | "complete"
  | "sticker";

export type VoicePhrase = {
  event: VoiceEvent;
  /** Stable id for analytics / replay; never includes personal data. */
  phraseId: string;
  text: string;
};

const WELCOME = [
  "Hoi! Zullen we samen boodschappen doen?",
  "Ben je klaar voor ons boodschappenavontuur?",
  "Kom, we gaan op zoek naar de boodschappen!",
] as const;

const POSITIVE = [
  "Gevonden!",
  "Yes, die hebben we!",
  "Goed gedaan!",
  "Dat is hem!",
  "Die mag in het wagentje!",
  "Helemaal goed!",
] as const;

const INCORRECT = [
  "Oeps, die zoeken we nog niet.",
  "Bijna! Kijk nog eens goed.",
  "Dat is iets anders. Probeer het nog maar eens.",
] as const;

const ENCOURAGEMENT = [
  "Wat zijn we goed bezig!",
  "We zijn al een heel eind!",
  "Nog een paar boodschappen!",
  "Nog eentje te gaan!",
] as const;

const COMPLETE = [
  "Gelukt! Alle boodschappen zijn gevonden.",
  "Wat heb jij goed geholpen vandaag!",
  "Ons boodschappenavontuur zit erop!",
] as const;

const STICKER = [
  "Kijk, je hebt een nieuwe sticker verdiend!",
  "Er is een nieuwe sticker voor jouw stickerboek!",
] as const;

const PRODUCT = [
  (name: string) => `Kun jij de ${name} vinden?`,
  (name: string) => `Zullen we de ${name} zoeken?`,
  (name: string) => `Op zoek naar de ${name}!`,
  (name: string) => `Nu hebben we ${name} nodig.`,
] as const;

/** Deterministic pick that still rotates; avoids the same line twice in a row when possible. */
export function pickVariant<T>(options: readonly T[], seed: string, avoid?: T): T {
  if (!options.length) throw new Error("no variants");
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  let index = hash % options.length;
  if (avoid !== undefined && options.length > 1 && options[index] === avoid) {
    index = (index + 1) % options.length;
  }
  return options[index]!;
}

function fixed(event: VoiceEvent, lines: readonly string[], seed: string, avoidText?: string): VoicePhrase {
  const text = pickVariant(lines, seed, avoidText);
  const phraseId = `${event}:${lines.indexOf(text)}`;
  return { event, phraseId, text };
}

export function welcomePhrase(seed: string, avoidText?: string): VoicePhrase {
  return fixed("welcome", WELCOME, seed, avoidText);
}

export function positivePhrase(seed: string, avoidText?: string): VoicePhrase {
  return fixed("positive", POSITIVE, seed, avoidText);
}

export function incorrectPhrase(seed: string, avoidText?: string): VoicePhrase {
  return fixed("incorrect", INCORRECT, seed, avoidText);
}

export function encouragementPhrase(seed: string, avoidText?: string): VoicePhrase {
  return fixed("encouragement", ENCOURAGEMENT, seed, avoidText);
}

export function completePhrase(seed: string, avoidText?: string): VoicePhrase {
  return fixed("complete", COMPLETE, seed, avoidText);
}

export function stickerPhrase(seed: string, avoidText?: string): VoicePhrase {
  return fixed("sticker", STICKER, seed, avoidText);
}

export function productPhrase(
  item: { productId: string; name: string; brand?: string; packageSize?: string; canonicalName?: string },
  seed: string,
  avoidText?: string,
): VoicePhrase {
  const spoken = spokenNameInSentence(spokenProductName(item));
  const lines = PRODUCT.map((build) => build(spoken));
  const text = pickVariant(lines, seed, avoidText);
  const phraseId = `product:${lines.indexOf(text)}:${normalizeKey(spoken)}`;
  return { event: "product", phraseId, text };
}

/** Allowed static phrase texts the server will speak without a free-form input. */
export const ALLOWED_STATIC_TEXTS = new Set<string>([
  ...WELCOME,
  ...POSITIVE,
  ...INCORRECT,
  ...ENCOURAGEMENT,
  ...COMPLETE,
  ...STICKER,
]);

const PRODUCT_PATTERNS = [
  /^Kun jij de (.+) vinden\?$/,
  /^Zullen we de (.+) zoeken\?$/,
  /^Op zoek naar de (.+)!$/,
  /^Nu hebben we (.+) nodig\.$/,
];

const MAX_SPOKEN_NAME = 40;
const MAX_TEXT = 120;

/** Server-side allowlist: static phrases or known product-instruction templates. */
export function isAllowedSpeechText(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > MAX_TEXT) return false;
  if (ALLOWED_STATIC_TEXTS.has(trimmed)) return true;
  for (const pattern of PRODUCT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match?.[1]) continue;
    const name = match[1].trim();
    if (!name || name.length > MAX_SPOKEN_NAME) return false;
    if (/[<>{}[\]\\]|https?:/i.test(name)) return false;
    return true;
  }
  return false;
}

export function normalizeKey(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function cacheKeyParts(input: {
  text: string;
  voice: string;
  model: string;
  instructionVersion?: string;
  language?: string;
}): string {
  const language = input.language ?? VOICE_LANGUAGE;
  const version = input.instructionVersion ?? VOICE_INSTRUCTION_VERSION;
  return [normalizeKey(input.text), language, input.voice, version, input.model].join("|");
}
