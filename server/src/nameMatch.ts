import { PRODUCT_CATEGORIES, type ProductCategory } from "./offers/match.js";
import { HOUSE_BRANDS, isHouseBrandRow, RETAILER_RANK, type RetailerId, type SourceRetailer } from "./offers/prijsprofeet.js";
import { parseName, parseSize, type Packaging, type ParsedName, type Size } from "./productName.js";

/**
 * Deciding, without a model, whether a search row shows the product a parent typed: the same brand, the same
 * formulation (regular Chocomel is not "0% suiker", "Halfvol" or "Plant-based") and, when asked, the same packaging or
 * size. A name match only ever gives a picture: never a barcode, nutrition or a pack size for the item.
 */

export type NameSource = "prijsprofeet" | "off";

/** One product from a name search, from PrijsProfeet or Open Food Facts. */
export type NameRow = {
  source: NameSource;
  retailer?: SourceRetailer;
  name: string;
  brands: string[];
  quantity?: string;
  imageUrl?: string;
  sourceUrl?: string;
  ean?: string;
  category?: string;
  /** True when PrijsProfeet marked it, or when the brand is a known house brand. */
  privateLabel?: boolean;
  promotionStatus?: string;
};

export type NameImage = {
  source: NameSource;
  productName: string;
  brand?: string;
  /** The pack as the source writes it ("1 l", "6 x 200 ml"); for showing only. */
  packaging?: string;
  /** No barcode on purpose: a name match is never evidence for an EAN. */
  imageUrl: string;
  retailer?: SourceRetailer;
  sourceUrl?: string;
  confidence: "high" | "medium";
  privateLabel?: boolean;
};

export type NameMatch = {
  classification: "branded" | "unknown";
  brand?: string;
  /** What the parent asked for besides the brand ("0% suiker", "pindakaas"); empty for the plain product. */
  variant?: string;
  match: NameImage | null;
  alternatives: NameImage[];
  /** Private-label alternatives for the shopping supermarket, when requested. */
  privateLabelAlternatives?: NameImage[];
  category?: ProductCategory;
};

/** Words that do not make another version of a product. */
const NEUTRAL = new Set([
  "vol",
  "volle",
  "original",
  "originele",
  "origineel",
  "orginal",
  "classic",
  "classics",
  "klassiek",
  "klassieke",
  "voordeel",
  "voordeelpak",
  "voordeelverpakking",
  "pack",
  "multipack",
  "utz",
  "mb",
  "toegevoegd",
  "toegevoegde",
  "x",
  "st",
  "stuk",
  "stuks",
  "per",
  "uht",
  "houdbaar",
  "houdbare",
  "nl",
  "the",
  "de",
  "het",
]);

/** Words that make another formulation or flavour; never silently swapped for the regular product. */
const FORMULATION = new Set([
  "halfvol",
  "halfvolle",
  "mager",
  "magere",
  "light",
  "lite",
  "zero",
  "suiker",
  "suikervrij",
  "suikers",
  "minder",
  "lactosevrij",
  "lactose",
  "glutenvrij",
  "gluten",
  "plant",
  "based",
  "plantaardig",
  "plantaardige",
  "vegan",
  "vega",
  "vegetarisch",
  "protein",
  "proteine",
  "proteinen",
  "eiwit",
  "eiwitten",
  "high",
  "dark",
  "puur",
  "pure",
  "wit",
  "witte",
  "white",
  "melkchocolade",
  "extra",
  "bio",
  "biologisch",
  "biologische",
  "organic",
  "ongezouten",
  "gezouten",
  "zout",
  "zoutarm",
  "stukjes",
  "crunchy",
  "chunky",
  "smooth",
  "creamy",
  "cafeinevrij",
  "decaf",
  "alcoholvrij",
  "kids",
  "mini",
  "maxi",
  "go",
  "drink",
  "shake",
  "ijs",
  "aardbei",
  "aardbeien",
  "vanille",
  "vanilla",
  "banaan",
  "banana",
  "framboos",
  "frambozen",
  "kers",
  "kersen",
  "perzik",
  "mango",
  "citroen",
  "sinaasappel",
  "appel",
  "peer",
  "bosvruchten",
  "rood",
  "rode",
  "fruit",
  "chocolade",
  "choco",
  "cacao",
  "karamel",
  "caramel",
  "hazelnoot",
  "hazelnoten",
  "kokos",
  "mokka",
  "koffie",
  "honing",
  "munt",
  "cherry",
  "strawberry",
  "ananas",
  "passievrucht",
  "maracuja",
  "limoen",
  "abrikoos",
  "pistache",
  "kaneel",
  "speculoos",
  "yoghurt",
  "kwark",
  "vla",
  "drinkyoghurt",
  "yogurt",
  "drinkyogurt",
  "yoghurtdrink",
  "skyr",
  "toetje",
  "dessert",
  "smoothie",
  "pudding",
  "reep",
  "repen",
  "koek",
  "koekjes",
  "biscuit",
  "biscuits",
  "wafel",
  "wafels",
  "framboos",
  "blauwe",
  "bes",
  "bessen",
  "multivitamine",
  "tropical",
  "cola",
  "spicy",
  "pittig",
  "pittige",
  "mild",
  "milde",
  "naturel",
]);

/** The same formulation written differently. */
const SYNONYM: Record<string, string> = {
  zero: "0%",
  proteine: "protein",
  proteinen: "protein",
  eiwit: "protein",
  eiwitten: "protein",
  plantaardig: "plant",
  plantaardige: "plant",
  magere: "mager",
  halfvolle: "halfvol",
  biologisch: "bio",
  biologische: "bio",
  organic: "bio",
  vanilla: "vanille",
  strawberry: "aardbei",
  aardbeien: "aardbei",
  frambozen: "framboos",
  suikers: "suiker",
  suikervrij: "0%",
};

const ROW_PACKAGING: Record<string, Packaging> = {
  blik: "can",
  blikje: "can",
  blikjes: "can",
  blikken: "can",
  fles: "bottle",
  flesje: "bottle",
  flesjes: "bottle",
  flessen: "bottle",
  pet: "bottle",
  pak: "carton",
  pakje: "carton",
  pakjes: "carton",
  pakken: "carton",
  pot: "jar",
  potje: "jar",
  zak: "bag",
  zakje: "bag",
  tube: "tube",
  knijpfles: "bottle",
};

/** longerBrandShare: a longer brand needs at least 1/n of the rows the best-supported brand has. */
export const NAME_RULES = { alternatives: 6, sizeTolerance: 0.05, maxUnknownWords: 1, longerBrandShare: 2, otherBrandShare: 1 };

/** Lowercase words without accents; "0%" stays one word and "plant-based" becomes two. */
export function words(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[^a-z0-9%.]+/g, " ")
    .replace(/(^|\s)\.+|\.+(\s|$)/g, " ")
    .split(" ")
    .filter(Boolean);
}

const canonical = (word: string) => SYNONYM[word] ?? word;
const isQuantity = (word: string) => /^\d/.test(word) && !word.endsWith("%");
const UNIT_WORDS = new Set(["ml", "cl", "dl", "l", "ltr", "liter", "liters", "g", "gr", "gram", "grams", "kg", "kilo"]);

/** The size on a row: its quantity field first, else a size written in its name. */
export function rowSize(row: Pick<NameRow, "quantity" | "name">): Size | null {
  for (const text of [row.quantity, row.name]) {
    if (!text) continue;
    const direct = parseSize(text);
    if (direct) return direct;
    const found = /(\d{1,2}\s*[x×]\s*)?\d{1,4}(?:[.,]\d{1,2})?\s*(ml|cl|dl|l|ltr|liter|g|gr|gram|kg)\b/i.exec(text);
    const parsed = found && parseSize(found[0]);
    if (parsed) return parsed;
  }
  return null;
}

function rowMultipack(row: NameRow, size: Size | null): boolean {
  const text = `${row.name} ${row.quantity ?? ""}`;
  return Boolean(size?.count) || /\d\s*[x×]\s*\d/i.test(text) || /\b\d{1,2}-?pack\b|multipack/i.test(text);
}

function rowPackaging(row: NameRow): Packaging | undefined {
  for (const word of words(row.name)) {
    const found = Object.hasOwn(ROW_PACKAGING, word) ? ROW_PACKAGING[word] : undefined;
    if (found) return found;
  }
  return undefined;
}

const startsWith = (list: string[], prefix: string[]) => prefix.length > 0 && prefix.length <= list.length && prefix.every((word, index) => list[index] === word);

const contains = (list: string[], sequence: string[]) => list.some((_, start) => startsWith(list.slice(start), sequence));

/** Rows that sell a product by this name under another brand ("Cashewnoten" from AH, Jumbo and Lidl). */
function otherBrandRows(brand: string[], rows: NameRow[]): number {
  return rows.filter((row) => row.brands.length > 0 && !row.brands.some((entry) => startsWith(words(entry), brand)) && contains(words(row.name), brand)).length;
}

/**
 * The brand the typed name starts with ("calve pindakaas" -> ["calve"]). A longer brand ("AH Terra" over "AH") only
 * wins when enough rows carry it, so one row tagged "Calvé Pindakaas" does not swallow the product word. A product
 * type that one row lists as its brand stays a product type when more rows sell it under other brands.
 */
function brandOf(query: string[], rows: NameRow[]): string[] | null {
  const support = new Map<string, { brand: string[]; rows: number }>();
  for (const row of rows) {
    const seen = new Set<string>();
    for (const brand of row.brands) {
      const brandWords = words(brand);
      const key = brandWords.join(" ");
      if (!startsWith(query, brandWords) || seen.has(key)) continue;
      seen.add(key);
      const entry = support.get(key) ?? { brand: brandWords, rows: 0 };
      entry.rows += 1;
      support.set(key, entry);
    }
  }
  const most = Math.max(0, ...[...support.values()].map((entry) => entry.rows));
  let best: string[] | null = null;
  for (const entry of support.values()) {
    if (entry.rows * NAME_RULES.longerBrandShare < most) continue;
    if (otherBrandRows(entry.brand, rows) > entry.rows * NAME_RULES.otherBrandShare) continue;
    if (!best || entry.brand.length > best.length) best = entry.brand;
  }
  return best;
}

function removeSequence(list: string[], sequence: string[]): string[] {
  for (let start = 0; start + sequence.length <= list.length; start += 1) {
    if (sequence.every((word, index) => list[start + index] === word)) return [...list.slice(0, start), ...list.slice(start + sequence.length)];
  }
  return list;
}

type Judged = { row: NameRow; brandHit: boolean; hasAll: boolean; eligible: boolean; score: number };

function sameSize(wanted: Size, found: Size | null): boolean {
  if (!found || found.unit !== wanted.unit) return false;
  if ((wanted.count ?? 1) !== (found.count ?? 1)) return false;
  return Math.abs(found.amount - wanted.amount) <= wanted.amount * NAME_RULES.sizeTolerance;
}

function judge(row: NameRow, brand: string[], requested: string[], parsed: ParsedName): Judged {
  const brandHit = row.brands.some((entry) => startsWith(words(entry), brand) && words(entry).length === brand.length) || startsWith(words(row.name), brand);
  const size = rowSize(row);
  const multipack = rowMultipack(row, size);
  const packaging = rowPackaging(row);
  let rest = removeSequence(words(row.name), brand).map(canonical);
  const wanted = requested.map(canonical);
  const hasAll = wanted.every((word) => rest.includes(word));
  for (const word of wanted) rest = removeSequence(rest, [word]);
  rest = rest.filter((word) => !NEUTRAL.has(word) && !isQuantity(word) && !UNIT_WORDS.has(word) && !Object.hasOwn(ROW_PACKAGING, word));
  const formulation = rest.filter((word) => FORMULATION.has(word) || word.endsWith("%") || Object.values(SYNONYM).includes(word));
  const unknown = rest.length - formulation.length;
  const formulationOk = brandHit && hasAll && formulation.length === 0;

  let packagingOk = true;
  if (parsed.packaging === "multipack") packagingOk = multipack;
  else if (parsed.packaging === "can" || parsed.packaging === "bottle") packagingOk = packaging === parsed.packaging;
  else if (parsed.packaging) packagingOk = packaging === parsed.packaging || (!packaging && !multipack);
  const sizeOk = !parsed.size || sameSize(parsed.size, size);

  const eligible = formulationOk && unknown <= NAME_RULES.maxUnknownWords && packagingOk && sizeOk && Boolean(row.imageUrl);
  const score =
    (multipack ? 0 : 4) +
    (parsed.packaging && packaging === parsed.packaging ? 2 : 0) +
    (!parsed.size && size?.unit === "ml" && size.amount === 1000 && !multipack ? 1 : 0) -
    unknown * 2 +
    (formulationOk ? 8 : 0);
  return { row, brandHit, hasAll, eligible, score };
}

function order(a: Judged, b: Judged, listRetailer?: string, wantedSize?: Size | null): number {
  const promo = (row: NameRow) => (row.promotionStatus === "active" ? 1 : 0);
  const listScore = (row: NameRow) => (listRetailer && row.retailer === listRetailer ? 0 : 1);
  const sizeScore = (row: NameRow) => (wantedSize && sameSize(wantedSize, rowSize(row)) ? 0 : 1);
  return (
    b.score - a.score ||
    sizeScore(a.row) - sizeScore(b.row) ||
    listScore(a.row) - listScore(b.row) ||
    promo(a.row) - promo(b.row) ||
    (RETAILER_RANK[a.row.retailer ?? ""] ?? 99) - (RETAILER_RANK[b.row.retailer ?? ""] ?? 99) ||
    a.row.name.length - b.row.name.length ||
    a.row.name.localeCompare(b.row.name)
  );
}

function productKey(row: NameRow): string {
  if (row.ean) return `ean:${row.ean}`;
  const size = rowSize(row);
  return `name:${words(row.name).join(" ")}|${size ? `${size.count ?? 1}x${size.amount}${size.unit}` : row.quantity ?? ""}`;
}

function rowLooksHouseBrand(row: NameRow): boolean {
  return isHouseBrandRow({
    retailer: row.retailer ?? "",
    brand: row.brands[0],
    productName: row.name,
    privateLabel: row.privateLabel,
  });
}

/** House brands from another supermarket are out, unless the parent typed that house brand. */
function allowHouseBrand(row: NameRow, typedBrand: string[], listRetailer?: string): boolean {
  if (!rowLooksHouseBrand(row)) return true;
  const house = HOUSE_BRANDS[row.retailer ?? ""] ?? [];
  const typedIsHouse = typedBrand.length > 0 && house.some((brand) => startsWith(typedBrand, words(brand)) || startsWith(words(brand), typedBrand));
  if (typedIsHouse) return true;
  return Boolean(listRetailer && row.retailer === listRetailer);
}

function imageOf(row: NameRow, confidence: NameImage["confidence"], brand: string | undefined): NameImage {
  return {
    source: row.source,
    productName: row.name.slice(0, 120),
    ...(brand && { brand }),
    ...(row.quantity && { packaging: row.quantity.slice(0, 40) }),
    imageUrl: row.imageUrl!,
    ...(row.retailer && { retailer: row.retailer }),
    ...(row.sourceUrl && { sourceUrl: row.sourceUrl }),
    ...(row.privateLabel === true && { privateLabel: true }),
    confidence,
  };
}

/** House-brand rows for one supermarket: flagged private_label or a known house brand for that retailer. */
export function privateLabelImages(typed: string, rows: NameRow[], retailer: RetailerId, limit = NAME_RULES.alternatives): NameImage[] {
  const parsed = parseName(typed);
  if (!parsed) return [];
  const query = words(parsed.base);
  const core = query.filter((word) => !NEUTRAL.has(word));
  const candidates = rows
    .filter((row) => row.retailer === retailer && row.imageUrl && rowLooksHouseBrand(row))
    .map((row) => {
      const nameWords = words(row.name);
      const hasAll = core.every((word) => nameWords.includes(word) || words(row.brands.join(" ")).includes(word));
      return { row, hasAll, score: hasAll ? 10 : 0 };
    })
    .filter((entry) => entry.hasAll)
    .sort((a, b) => b.score - a.score || a.row.name.length - b.row.name.length);
  const seen = new Set<string>();
  const out: NameImage[] = [];
  for (const entry of candidates) {
    if (out.length >= limit) break;
    const key = productKey(entry.row);
    if (seen.has(key) || seen.has(entry.row.imageUrl!)) continue;
    seen.add(key);
    seen.add(entry.row.imageUrl!);
    out.push(imageOf(entry.row, "medium", entry.row.brands[0]));
  }
  return out;
}

/** Where each PrijsProfeet category sits in the shop; categories without one clear department are left out. */
const DEPARTMENT_OF: Record<string, ProductCategory> = {
  "groente-fruit": "produce",
  "zuivel-eieren": "dairy",
  kaas: "dairy",
  vlees: "meat",
  vis: "meat",
  vega: "meat",
  "brood-bakkerij": "bakery",
  ontbijt: "breakfast",
  "pasta-rijst-wereldkeuken": "pantry",
  "soepen-conserven-sauzen": "pantry",
  "snoep-koek-chips": "pantry",
  frisdrank: "drinks",
  "koffie-thee": "drinks",
  bier: "drinks",
  wijn: "drinks",
  "sterke-drank": "drinks",
  "bier-wijn-sterke-drank": "drinks",
  diepvries: "frozen",
  huishouden: "household",
  drogisterij: "household",
  huidverzorging: "household",
  haarverzorging: "household",
  deodorant: "household",
  mondverzorging: "household",
  "baby-kind": "household",
  huisdier: "household",
};

/** The app department for a PrijsProfeet category, when it has one clear place. */
export function categoryOf(unified: string | undefined): ProductCategory | undefined {
  return unified && Object.hasOwn(DEPARTMENT_OF, unified) && PRODUCT_CATEGORIES.includes(DEPARTMENT_OF[unified]) ? DEPARTMENT_OF[unified] : undefined;
}

/** Words of the base as typed ("Calvé pindakaas", 0, 1 -> "Calvé"). */
function typedWords(base: string, from: number, to?: number): string {
  return base.split(" ").slice(from, to).join(" ");
}

export function matchName(typed: string, rows: NameRow[], listRetailer?: RetailerId): NameMatch {
  const parsed = parseName(typed);
  if (!parsed) return { classification: "unknown", match: null, alternatives: [] };
  const query = words(parsed.base);
  const brand = brandOf(query, rows);
  if (!brand) return { classification: "unknown", match: null, alternatives: [] };
  const requested = query.slice(brand.length);
  const brandName = typedWords(parsed.base, 0, brand.length);
  const branded = rows
    .filter((row) => allowHouseBrand(row, brand, listRetailer))
    .map((row) => judge(row, brand, requested, parsed))
    .filter((entry) => entry.brandHit);
  /** Prefer manufacturer rows for the automatic photo; private labels stay in dedicated alternatives. */
  const byPreference = (a: Judged, b: Judged) =>
    (rowLooksHouseBrand(a.row) ? 1 : 0) - (rowLooksHouseBrand(b.row) ? 1 : 0) || order(a, b, listRetailer, parsed.size);
  const best = branded.filter((entry) => entry.eligible && !rowLooksHouseBrand(entry.row)).sort(byPreference)[0]
    ?? branded.filter((entry) => entry.eligible).sort(byPreference)[0];
  const match = best ? imageOf(best.row, "high", brandName) : null;
  const seen = new Set<string>();
  if (match && best) {
    seen.add(match.imageUrl);
    seen.add(productKey(best.row));
  }
  const alternatives: NameImage[] = [];
  /** With a plain match, only other plain packs; without one, flavour rows the parent can pick from. */
  const altPool = best
    ? branded.filter((item) => item.eligible && !rowLooksHouseBrand(item.row))
    : branded.filter((item) => item.row.imageUrl && item.hasAll && item.brandHit && !rowLooksHouseBrand(item.row));
  for (const entry of altPool.sort((a, b) => order(a, b, listRetailer, parsed.size))) {
    if (alternatives.length >= NAME_RULES.alternatives) break;
    const key = productKey(entry.row);
    if (seen.has(entry.row.imageUrl!) || seen.has(key)) continue;
    seen.add(entry.row.imageUrl!);
    seen.add(key);
    alternatives.push(imageOf(entry.row, "medium", brandName));
  }
  const category = categoryOf((best ?? [...branded].sort((a, b) => order(a, b, listRetailer, parsed.size))[0])?.row.category);
  const variant = typedWords(parsed.base, brand.length);
  return { classification: "branded", brand: brandName, ...(variant && { variant }), match, alternatives, ...(category && { category }) };
}
