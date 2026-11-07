import type { OfferRow } from "./prijsprofeet.js";

export type ProductCategory = "produce" | "bakery" | "pantry" | "dairy" | "frozen" | "household";

/** What the app knows about one list item. `generic` items ("Banaan") have no brand or barcode. */
export type OfferProduct = {
  name: string;
  aliases?: string[];
  category: ProductCategory;
  generic: boolean;
  brand?: string;
  variant?: string;
  size?: string;
  ean?: string;
};

export type MatchType = "exact" | "likely" | "none" | "unknown";
export type MatchConfidence = "high" | "medium";

export type OfferMatch =
  | { matchType: "exact" | "likely"; matchConfidence: MatchConfidence; offer: OfferRow }
  | { matchType: "none" | "unknown" };

/** PrijsProfeet's unified categories that may hold each app category. */
export const CATEGORY_MAP: Record<ProductCategory, readonly string[]> = {
  produce: ["groente-fruit", "aardappelen-groente-fruit"],
  dairy: ["zuivel-eieren", "kaas", "zuivel", "eieren"],
  bakery: ["brood-bakkerij", "brood", "bakkerij"],
  frozen: ["diepvries"],
  pantry: [
    "ontbijt",
    "pasta-rijst-wereldkeuken",
    "soepen-conserven-sauzen",
    "snoep-koek-chips",
    "frisdrank",
    "koffie-thee",
    "ontbijtgranen-beleg",
    "conserven",
  ],
  household: ["huishouden", "schoonmaak", "wasmiddel", "papier"],
};

/** Words that do not change what a generic product is. */
const NEUTRAL = new Set([
  "los",
  "losse",
  "per",
  "stuk",
  "stuks",
  "st",
  "kg",
  "kilo",
  "g",
  "gr",
  "gram",
  "l",
  "liter",
  "ml",
  "cl",
  "x",
  "ca",
  "circa",
  "vers",
  "verse",
  "pak",
  "fles",
  "huismerk",
]);

/** Words that keep the same product but make it one particular kind of it. */
const DESCRIPTORS = new Set([
  "bio",
  "biologisch",
  "biologische",
  "eko",
  "tros",
  "zak",
  "zakje",
  "schaal",
  "schaaltje",
  "bakje",
  "net",
  "netje",
  "doos",
  "mini",
  "groot",
  "grote",
  "klein",
  "kleine",
  "rood",
  "rode",
  "groen",
  "groene",
  "geel",
  "gele",
  "bruin",
  "bruine",
  "halfvol",
  "halfvolle",
  "vol",
  "volle",
  "mager",
  "magere",
  "zoet",
  "zoete",
  "hollandse",
  "nederlandse",
  "fairtrade",
  "voordeel",
  "voordeelverpakking",
  "multipack",
  "jong",
  "jonge",
  "belegen",
  "heel",
  "hele",
  "half",
  "halve",
]);

const HOUSE_BRANDS = new Set(["ah", "albert heijn", "jumbo", "lidl", "ah biologisch", "ah terra", "ah basic"]);

export function words(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Folds Dutch singular and plural together: banaan/bananen, tomaat/tomaten, appel/appels, ui/uien. */
export function stem(word: string): string {
  const bare = word.length >= 4 ? word.replace(/(en|s)$/, "") : word;
  return bare.replace(/([aeou])\1/g, "$1");
}

type Size = { amount: number; unit: "g" | "ml" | "stuk" };

const UNIT_FACTORS: Record<string, [Size["unit"], number]> = {
  g: ["g", 1],
  gr: ["g", 1],
  gram: ["g", 1],
  kg: ["g", 1000],
  kilo: ["g", 1000],
  ml: ["ml", 1],
  cl: ["ml", 10],
  l: ["ml", 1000],
  liter: ["ml", 1000],
  lt: ["ml", 1000],
  st: ["stuk", 1],
  stuk: ["stuk", 1],
  stuks: ["stuk", 1],
};

/** "1 l", "1,5 liter", "6 x 330 ml", "500 g". Null when the text is not a plain size. */
export function parseSize(value: string | undefined): Size | null {
  if (!value) return null;
  const match = /^(?:(\d+)\s*x\s*)?(\d+(?:[.,]\d+)?)\s*([a-z]+)\.?$/i.exec(value.trim().toLowerCase());
  if (!match) return null;
  const factor = UNIT_FACTORS[match[3]];
  if (!factor) return null;
  const packs = match[1] ? Number(match[1]) : 1;
  return { unit: factor[0], amount: packs * Number(match[2].replace(",", ".")) * factor[1] };
}

/** True or false when both sizes are readable, undefined when one is missing or unclear. */
export function sameSize(a: string | undefined, b: string | undefined): boolean | undefined {
  const left = parseSize(a);
  const right = parseSize(b);
  if (!left || !right) return undefined;
  return left.unit === right.unit && Math.abs(left.amount - right.amount) <= left.amount * 0.01;
}

/** Today in the Netherlands as YYYY-MM-DD; promotions run until the end of their last day there. */
export function amsterdamToday(now: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(now);
}

export function isRunning(row: OfferRow, now: number): boolean {
  if (row.promotionStatus !== "active") return false;
  const today = amsterdamToday(now);
  if (row.validUntil && row.validUntil < today) return false;
  if (row.validFrom && row.validFrom > today) return false;
  return true;
}

function brandWords(brand: string | undefined): string[] {
  return brand ? words(brand) : [];
}

function isHouseBrand(row: OfferRow): boolean {
  if (row.privateLabel === true) return true;
  if (!row.brand) return true;
  return HOUSE_BRANDS.has(words(row.brand).join(" "));
}

/** The row's name without its brand, number and unit tokens, as stems. */
function rowStems(row: OfferRow): string[] {
  const brand = new Set(brandWords(row.brand));
  const house = new Set(["ah", "jumbo", "lidl", "albert", "heijn"]);
  return words(row.productName)
    .filter((word) => !brand.has(word) && !house.has(word) && !/^\d/.test(word))
    .map(stem);
}

/**
 * Takes the longest of the product's names that is fully present in the row and returns what is left.
 * Null when no name is present at all.
 */
function remainder(names: string[], stems: string[]): string[] | null {
  let best: string[] | null = null;
  let bestLength = 0;
  for (const name of names) {
    const core = words(name).map(stem);
    if (!core.length || !core.every((part) => stems.includes(part))) continue;
    if (core.length > bestLength) {
      bestLength = core.length;
      best = stems.filter((part) => !core.includes(part));
    }
  }
  return best;
}

const NEUTRAL_STEMS = new Set([...NEUTRAL].map(stem));
const DESCRIPTOR_STEMS = new Set([...DESCRIPTORS].map(stem));

function genericMatch(product: OfferProduct, row: OfferRow): MatchConfidence | null {
  if (!row.category || !CATEGORY_MAP[product.category].includes(row.category)) return null;
  const left = remainder([product.name, ...(product.aliases ?? [])], rowStems(row));
  if (!left) return null;
  let confidence: MatchConfidence = "high";
  for (const part of left) {
    if (NEUTRAL_STEMS.has(part)) continue;
    if (DESCRIPTOR_STEMS.has(part)) confidence = "medium";
    else return null;
  }
  if (!isHouseBrand(row)) confidence = "medium";
  return confidence;
}

function brandedMatch(product: OfferProduct, row: OfferRow): MatchConfidence | null {
  const brand = brandWords(product.brand).join(" ");
  if (!brand) return null;
  const rowBrand = brandWords(row.brand).join(" ");
  const named = ` ${words(row.productName).join(" ")} `;
  if (rowBrand ? rowBrand !== brand : !named.startsWith(` ${brand} `)) return null;
  const brandSet = new Set(brandWords(product.brand));
  const core = words(product.name).filter((word) => !brandSet.has(word));
  const stems = rowStems(row).filter((part) => !brandSet.has(part));
  const left = remainder([core.join(" ")], stems);
  if (!left || !core.length) return null;
  const variant = words(product.variant ?? "").map(stem);
  const variantPresent = variant.every((part) => stems.includes(part));
  const unexplained = left.filter((part) => !NEUTRAL_STEMS.has(part) && !variant.includes(part));
  const size = sameSize(product.size, row.quantity);
  if (variantPresent && unexplained.length === 0 && size === true) return "high";
  return "medium";
}

const RANK = { "exact-high": 4, "exact-medium": 3, "likely-high": 2, "likely-medium": 1 } as const;

/**
 * Picks the one promotion that is this product, strictly: an EAN is exact, a branded product needs the
 * same brand and name, a generic product needs its own name with only harmless extra words in a fitting
 * category. Anything doubtful is `none`; "bananen ontbijtje" is never "banaan".
 */
export function classify(product: OfferProduct, rows: readonly OfferRow[], now: number): OfferMatch {
  let best: OfferMatch = { matchType: "none" };
  let bestRank = 0;
  for (const row of rows) {
    if (!isRunning(row, now)) continue;
    let found: { matchType: "exact" | "likely"; matchConfidence: MatchConfidence } | null = null;
    if (product.ean && row.ean && row.ean.replace(/^0+/, "") === product.ean.replace(/^0+/, "")) {
      found =
        sameSize(product.size, row.quantity) === false
          ? { matchType: "likely", matchConfidence: "medium" }
          : { matchType: "exact", matchConfidence: "high" };
    } else {
      const confidence = product.generic ? genericMatch(product, row) : brandedMatch(product, row);
      if (confidence) found = { matchType: "likely", matchConfidence: confidence };
    }
    if (!found) continue;
    const rank = RANK[`${found.matchType}-${found.matchConfidence}`];
    if (rank > bestRank) {
      bestRank = rank;
      best = { ...found, offer: row };
    }
  }
  return best;
}
