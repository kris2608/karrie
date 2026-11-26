import { productById } from "../data/catalog";
import { productHeading } from "./productHeading";
import { ruleForSpokenNoun } from "./productSpeechGrammar";

/** Trailing pack size / count that should not be spoken to a toddler. */
const PACK_SIZE =
  /\s*[–—-]?\s*\d+([.,]\d+)?\s*(ml|cl|l|liter|liters|g|gr|gram|grammen|kg|stuks?|st\.?|x)?\b/gi;

/** Leading retailer / house-brand fluff already common in scanned titles. */
const LEADING_FLUFF = /^(ah|jumbo|plus|lidl|aldi|spar|coop|biologisch(?:e)?)\s+/i;

const MASS_NOUNS = new Set([
  "melk",
  "chocolademelk",
  "yoghurt",
  "kwark",
  "boter",
  "kaas",
  "rijst",
  "pasta",
  "suiker",
  "meel",
  "bloem",
  "water",
  "sap",
  "jus",
  "olie",
  "azijn",
  "honing",
  "jam",
  "pindakaas",
  "hagelslag",
  "stroop",
  "mais",
  "maïs",
  "ijs",
  "frisdrank",
  "siroop",
  "havermout",
  "muesli",
]);

/** Known Dutch articles for common preschool shopping nouns (lemma / spoken form). */
const ARTICLES: Record<string, "de" | "het"> = {
  banaan: "de",
  bananen: "de",
  appel: "de",
  appels: "de",
  peer: "de",
  peren: "de",
  melk: "de",
  chocolademelk: "de",
  yoghurt: "de",
  boter: "de",
  kaas: "de",
  brood: "het",
  ei: "het",
  eieren: "de",
  tomaat: "de",
  tomaten: "de",
  komkommer: "de",
  wortel: "de",
  wortels: "de",
  aardappel: "de",
  aardappelen: "de",
  aardappels: "de",
  sinaasappel: "de",
  sinaasappels: "de",
  druif: "de",
  druiven: "de",
  water: "het",
  sap: "het",
  rijst: "de",
  pasta: "de",
  appelmoes: "de",
  hagelslag: "de",
  pindakaas: "de",
  koekje: "het",
  koekjes: "de",
  winkelwagen: "de",
  croissant: "de",
  ui: "de",
  uien: "de",
  mais: "de",
  "maïs": "de",
  frisdrank: "de",
  drinkpakje: "het",
  ijs: "het",
  gehakt: "het",
  stokbrood: "het",
  sinaasappelsap: "het",
  toiletpapier: "het",
  keukenpapier: "het",
  afwasmiddel: "het",
  wasmiddel: "het",
  schoonmaakmiddel: "het",
};

const NUMBER_WORDS: Record<number, string> = {
  2: "twee",
  3: "drie",
  4: "vier",
  5: "vijf",
  6: "zes",
};

const PLURALS: Record<string, string> = {
  appel: "appels",
  banaan: "bananen",
  peer: "peren",
  tomaat: "tomaten",
  wortel: "wortels",
  aardappel: "aardappelen",
  sinaasappel: "sinaasappels",
  ei: "eieren",
  koekje: "koekjes",
  druif: "druiven",
  ui: "uien",
  augurk: "augurken",
};

function pluralForm(spoken: string): string {
  const key = spoken.toLowerCase();
  if (PLURALS[key]) return PLURALS[key];
  if (/en$|els$|ers$|s$/i.test(spoken)) return spoken;
  return spoken;
}

export type SpokenProductMeta = {
  /** Child-friendly bare name, e.g. "bananen" or "melk". */
  name: string;
  /** Sentence-ready lowercase form. */
  spoken: string;
  article?: "de" | "het";
  number: "singular" | "plural" | "mass";
  quantity: number;
};

/**
 * Child-friendly name for voice guidance. Prefers catalog names; never reads full retailer titles.
 * Keeps meaningful distinctions (e.g. chocolademelk stays chocolademelk).
 */
export function spokenProductName(item: {
  productId: string;
  name: string;
  brand?: string;
  packageSize?: string;
  kind?: string;
  canonicalName?: string;
}): string {
  return spokenProductMeta(item).spoken;
}

export function spokenProductMeta(item: {
  productId: string;
  name: string;
  brand?: string;
  packageSize?: string;
  kind?: string;
  canonicalName?: string;
  quantity?: number;
}): SpokenProductMeta {
  const catalog = productById(item.productId);
  let raw = "";
  if (catalog?.name) raw = tidy(catalog.name);
  else {
    const heading = productHeading({
      name: item.name,
      brand: item.brand,
      packageSize: item.packageSize,
    }).title;
    raw = tidy(heading);
    raw = raw.replace(PACK_SIZE, " ").replace(/\s+/g, " ").trim();
    raw = raw.replace(LEADING_FLUFF, "").trim();
    if (!raw && item.canonicalName) raw = tidy(item.canonicalName);
    if (!raw) raw = tidy(item.name) || "product";
  }

  if (raw.length > 32) {
    const cut = raw.slice(0, 32);
    const space = cut.lastIndexOf(" ");
    raw = (space > 12 ? cut.slice(0, space) : cut).trim();
  }

  const spoken = spokenNameInSentence(raw);
  const key = spoken.toLowerCase();
  const quantity = Math.max(1, Math.min(24, item.quantity ?? 1));
  const named = ruleForSpokenNoun(key);
  const mass = named?.number === "mass" || MASS_NOUNS.has(key) || MASS_NOUNS.has(key.replace(/s$/, ""));
  const namedPlural = named?.number === "plural" && named.noun === key;
  const looksPlural = namedPlural || (/en$|els$|ers$|s$/i.test(spoken) && !mass && named?.number !== "singular");
  const number: SpokenProductMeta["number"] = mass ? "mass" : looksPlural || quantity > 1 ? "plural" : "singular";
  const article = named?.article ?? ARTICLES[key] ?? ARTICLES[key.replace(/en$/, "")] ?? ARTICLES[key.replace(/s$/, "")];

  return { name: raw, spoken, article, number, quantity };
}

/**
 * Noun phrase suitable for templates that already carry structure.
 * Prefers article-free forms when article is unknown; uses list quantity (not pack size).
 * Skips quantity wording when it would make speech long or for mass nouns.
 */
export function spokenNounPhrase(
  item: {
    productId: string;
    name: string;
    brand?: string;
    packageSize?: string;
    kind?: string;
    canonicalName?: string;
    quantity?: number;
  },
  options?: { withArticle?: boolean; withQuantity?: boolean },
): string {
  const meta = spokenProductMeta(item);
  const withArticle = options?.withArticle === true;
  const withQuantity = options?.withQuantity !== false;

  let core = meta.spoken;
  if (withQuantity && meta.number !== "mass" && meta.quantity >= 2 && meta.quantity <= 6) {
    const word = NUMBER_WORDS[meta.quantity];
    core = pluralForm(core);
    if (word && core.length + word.length < 28) {
      core = `${word} ${core}`;
    }
  } else if (meta.number === "plural") {
    core = pluralForm(core);
  }

  if (withArticle && meta.article) return `${meta.article} ${core}`;
  return core;
}

/** Lowercase form used inside a Dutch sentence (except all-caps brands stay as-is). */
export function spokenNameInSentence(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "product";
  if (/^[A-ZÁÉÍÓÚÄËÏÖÜ]{2,}$/.test(trimmed)) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
