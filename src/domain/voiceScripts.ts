import { allVoiceCatalogInstructions, voiceCatalogEntry } from "./voiceCatalog";
import { spokenNounPhrase, spokenProductMeta } from "./spokenProductName";

const voiceCatalogEntryTexts = new Set(allVoiceCatalogInstructions());

export const VOICE_LANGUAGE = "nl-NL";
/** Bump when personality instructions or template wording change so caches refresh. */
export const VOICE_INSTRUCTION_VERSION = "v6";
/** Delivery v7: Maarten MP3, speed in the voice, playback at 1×. Prompt stays v6. */
export const VOICE_DELIVERY_VERSION = "v7";
export const VOICE_TEMPLATE_VERSION = "v6";
export const DEFAULT_VOICE_MODEL = "edge-tts";
export const DEFAULT_VOICE_NAME = "nl-NL-MaartenNeural";
export const VOICE_CACHE_NAMESPACE = "karrie-voice-v7-maarten";

export const VOICE_PERSONALITY =
  "Je bent Karrie, een blij kinderstemmetje voor een kind van een jaar of drie. Je spreekt Nederlands zoals in Nederland, zonder buitenlands accent. Je klinkt vrolijk, speels en enthousiast. Zeg alleen de zin die je krijgt, niets ervoor of erna.";

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
  /** Catalog product id when phrase is a fixed generic instruction. */
  productId?: string;
};

/** Spoken once when a fresh shopping round begins. */
export const START_LINE = "Hoi! Zullen we samen boodschappen gaan zoeken? Daar gaan we!";

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
  "Die is het!",
  "Helemaal goed!",
] as const;

/** Kept so older clients that still ask for this line do not get a 422. */
const LEGACY_STATIC = ["Dat is hem!"] as const;

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

/** The round-ending line. Longer and more festive than a single praise. */
export const CELEBRATION_LINE = "Hoera! Alle boodschappen zijn gevonden! Wat heb jij dat goed gedaan!";

const COMPLETE = [
  CELEBRATION_LINE,
  "Tadaa! We hebben alles gevonden! Hoera, wat goed van jou!",
  "Gelukt! Alle boodschappen zijn in het mandje! Dat hebben we samen gedaan!",
  "Jaaa! De speurtocht is klaar! Wat heb jij goed geholpen!",
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

/** Four canonical product forms — one fixed phrase per catalog productId. */
const PRODUCT: readonly ProductBuilder[] = [
  (item) => {
    const meta = spokenProductMeta(item);
    const np = spokenNounPhrase(item, { withArticle: Boolean(meta.article), withQuantity: true });
    return `Kun jij ${np} vinden?`;
  },
  (item) => `Nu gaan we ${spokenNounPhrase(item, { withArticle: true, withQuantity: false })} zoeken!`,
  (item) => {
    const meta = spokenProductMeta(item);
    const np = spokenNounPhrase(item, { withArticle: Boolean(meta.article), withQuantity: true });
    const plural = meta.number === "plural" || (meta.number !== "mass" && meta.quantity > 1);
    return plural ? `Waar zijn ${np}?` : `Waar is ${np}?`;
  },
  (item) => `Zoek maar ${spokenNounPhrase(item, { withArticle: true, withQuantity: true })}!`,
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

export function startPhrase(seed: string): VoicePhrase {
  return { event: "welcome", phraseId: `welcome:start:${normalizeKey(seed).slice(0, 24)}`, text: START_LINE };
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

/** One bigger ending line, stable for preload and playback. */
export function celebrationPhrase(seed: string): VoicePhrase {
  return { event: "complete", phraseId: `complete:celebration:${normalizeKey(seed).slice(0, 24)}`, text: CELEBRATION_LINE };
}

/**
 * Catalog generics: fixed instruction from voice-catalog.json (qty/adventure ignored).
 * Custom / unknown products: dynamic templates.
 */
export function productPhrase(item: ProductItem, _seed?: string, _avoidText?: string): VoicePhrase {
  const catalog = voiceCatalogEntry(item.productId);
  if (catalog) {
    return {
      event: "product",
      phraseId: `product:catalog:${normalizeKey(catalog.productId)}`,
      text: catalog.instruction,
      productId: catalog.productId,
    };
  }
  const lines = PRODUCT.map((build) => build(item));
  const text = pickVariant(lines, item.productId || item.name);
  const spoken = spokenProductMeta(item).spoken;
  const phraseId = `product:${lines.indexOf(text)}:${normalizeKey(spoken)}`;
  return { event: "product", phraseId, text };
}

/** Allowed static phrase texts the server will speak without a free-form input. */
export const ALLOWED_STATIC_TEXTS = new Set<string>([
  START_LINE,
  ...WELCOME,
  ...POSITIVE,
  ...LEGACY_STATIC,
  ...INCORRECT,
  ...ENCOURAGEMENT,
  ...COMPLETE,
  ...STICKER,
  ...MISSION,
  ...PLAY,
]);

const PRODUCT_PATTERNS = [
  /^Kun jij (.+) vinden\?$/,
  /^Nu gaan we (.+) zoeken!$/,
  /^Waar zijn (.+)\?$/,
  /^Waar is (.+)\?$/,
  /^Zoek maar (.+)!$/,
  /^Zoek jij (.+)\?$/,
  // Legacy templates still accepted so old clients / caches do not 422.
  /^Hmm… waar zouden (.+) zijn\?$/,
  /^Hmm… waar zou (.+) zijn\?$/,
  /^Zo, nu nog (.+)!$/,
  /^(.+)! Zie jij .+ al\?$/,
  /^Op zoek naar (.+)!$/,
  /^Nog eentje: (.+)!$/,
  /^We hebben .+ (.+) nodig\.$/,
  /^Zoek iets .+!$/,
];

const MAX_SPOKEN_NAME = 40;
const MAX_TEXT = 140;

/** Server-side allowlist: static phrases, catalog instructions, or known templates. */
export function isAllowedSpeechText(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > MAX_TEXT) return false;
  if (ALLOWED_STATIC_TEXTS.has(trimmed)) return true;
  if (voiceCatalogEntryTexts.has(trimmed)) return true;
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
