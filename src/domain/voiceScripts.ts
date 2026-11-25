import { spokenNameInSentence, spokenNounPhrase, spokenProductMeta } from "./spokenProductName";

export const VOICE_LANGUAGE = "nl-NL";
/** Bump when personality instructions or template wording change so caches refresh. */
export const VOICE_INSTRUCTION_VERSION = "v4";
export const VOICE_DELIVERY_VERSION = "v4";
export const VOICE_TEMPLATE_VERSION = "v4";

export const VOICE_PERSONALITY =
  "You are Karrie, one warm shopping friend for children aged two to five. Always the same calm mid pitch and speaker identity. Speak authentic Netherlands Dutch with clear vowels and natural Dutch rhythm — never English-accented. Always speak the supplied Dutch text without adding extra words.";

export type VoiceEvent =
  | "welcome"
  | "product"
  | "positive"
  | "incorrect"
  | "encouragement"
  | "complete"
  | "sticker"
  | "mission"
  | "play";

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
  "Hebbes!",
  "Ja hoor!",
  "Gevonden!",
  "Die mag in ons wagentje!",
  "Kijk eens aan!",
  "Ja, die hebben we!",
  "Goed gedaan!",
  "Dat is hem!",
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
  "Tadaa! Dat hebben we samen mooi gedaan!",
] as const;

const STICKER = [
  "Kijk, je hebt een nieuwe sticker verdiend!",
  "Er is een nieuwe sticker voor jouw stickerboek!",
] as const;

const MISSION = [
  "Psst… ik heb een speciale opdracht voor je!",
  "Ik heb een bonusmissie!",
  "Zoek de bonus!",
] as const;

const PLAY = ["Sleep naar Karrie!", "Raad het product!"] as const;

type ProductItem = {
  productId: string;
  name: string;
  brand?: string;
  packageSize?: string;
  canonicalName?: string;
  quantity?: number;
};

type ProductBuilder = (item: ProductItem) => string;

const PRODUCT: readonly ProductBuilder[] = [
  (item) => {
    const meta = spokenProductMeta(item);
    const np = spokenNounPhrase(item, { withArticle: Boolean(meta.article), withQuantity: true });
    const plural = meta.number === "plural" || (meta.number !== "mass" && meta.quantity > 1);
    return plural ? `Hmm… waar zouden ${np} zijn?` : `Hmm… waar zou ${np} zijn?`;
  },
  (item) => `Zo, nu nog ${spokenNounPhrase(item, { withQuantity: false })}!`,
  (item) => {
    const name = spokenNounPhrase(item, { withQuantity: false });
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    return `${cap}! Zie jij ${spokenNameInSentence(name)} al?`;
  },
  (item) => {
    const meta = spokenProductMeta(item);
    // Prefer article when known so we never invent the wrong one; otherwise article-free.
    const np = spokenNounPhrase(item, { withArticle: Boolean(meta.article), withQuantity: true });
    return `Kun jij ${np} vinden?`;
  },
  (item) => `Op zoek naar ${spokenNounPhrase(item, { withQuantity: true })}!`,
  (item) => `Nu gaan we ${spokenNounPhrase(item, { withQuantity: false })} zoeken!`,
  (item) => {
    const meta = spokenProductMeta(item);
    if (meta.article) return `Waar is ${meta.article} ${meta.spoken}?`;
    return `Waar is ${meta.spoken}?`;
  },
  (item) => `Nog eentje: ${spokenNounPhrase(item, { withQuantity: false })}!`,
];

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

export function missionPhrase(seed: string, avoidText?: string): VoicePhrase {
  return fixed("mission", MISSION, seed, avoidText);
}

export function playPhrase(seed: string, kind: "color" | "drag" | "guess", colorLabel?: string): VoicePhrase {
  if (kind === "color" && colorLabel) {
    const text = `Zoek iets ${colorLabel}!`;
    return { event: "play", phraseId: `play:color:${normalizeKey(colorLabel)}`, text };
  }
  if (kind === "drag") return fixed("play", ["Sleep naar Karrie!"] as const, seed);
  // Never spoil the guess answer — generic prompt only.
  return fixed("play", ["Raad het product!"] as const, seed);
}

/** Combined celebratory line for complete + sticker beat. */
export function celebrationPhrase(seed: string): VoicePhrase {
  const lines = [
    "Tadaa! Dat hebben we samen mooi gedaan!",
    "Gelukt! Alle boodschappen zijn gevonden.",
    "Wat heb jij goed geholpen vandaag!",
  ] as const;
  return fixed("complete", lines, seed);
}

export function productPhrase(item: ProductItem, seed: string, avoidText?: string): VoicePhrase {
  const lines = PRODUCT.map((build) => build(item));
  const text = pickVariant(lines, seed, avoidText);
  const spoken = spokenProductMeta(item).spoken;
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
  ...MISSION,
  ...PLAY,
]);

const PRODUCT_PATTERNS = [
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

/** Server-side allowlist: static phrases or known product-instruction templates. */
export function isAllowedSpeechText(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > MAX_TEXT) return false;
  if (ALLOWED_STATIC_TEXTS.has(trimmed)) return true;
  for (const pattern of PRODUCT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const name = (match[1] ?? "").trim();
    if (name && (name.length > MAX_SPOKEN_NAME || /[<>{}[\]\\]|https?:/i.test(name))) return false;
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
  deliveryVersion?: string;
  templateVersion?: string;
  language?: string;
  event?: string;
}): string {
  const language = input.language ?? VOICE_LANGUAGE;
  const version = [
    input.instructionVersion ?? VOICE_INSTRUCTION_VERSION,
    input.deliveryVersion ?? VOICE_DELIVERY_VERSION,
    input.templateVersion ?? VOICE_TEMPLATE_VERSION,
    input.event ?? "",
  ]
    .filter(Boolean)
    .join("|");
  return [normalizeKey(input.text), language, input.voice, version, input.model].join("|");
}
