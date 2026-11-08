/** Same rules as src/domain/customProduct.ts in the app; a name the app refuses must be refused here too. */

const MAX_LENGTH = 32;
const MAX_TYPED_LENGTH = 40;
const MAX_WORDS = 3;
const CONNECTORS = new Set(["voor", "met", "van", "en", "of", "zonder", "uit"]);
const VAGUE = new Set(["ding", "dingen", "spul", "spullen", "iets", "boodschappen", "product", "producten"]);
const VOWEL = /[aeiouy]/;

export const PACKAGING = ["can", "bottle", "carton", "jar", "bag", "tube", "multipack"] as const;
export type Packaging = (typeof PACKAGING)[number];

const PACKAGING_WORDS: Record<string, Packaging> = {
  blik: "can",
  blikje: "can",
  blikjes: "can",
  fles: "bottle",
  flesje: "bottle",
  flesjes: "bottle",
  flessen: "bottle",
  pak: "carton",
  pakje: "carton",
  pakjes: "carton",
  pakken: "carton",
  pot: "jar",
  potje: "jar",
  potten: "jar",
  zak: "bag",
  zakje: "bag",
  zakken: "bag",
  tube: "tube",
  multipack: "multipack",
};

/** A pack size: the amount of one unit in ml or g, and how many units for a multipack. */
export type Size = { unit: "ml" | "g"; amount: number; count?: number };

export type ParsedName = {
  /** What the parent typed, tidied; this stays the name on the list. */
  name: string;
  /** The product without packaging words or quantities ("Chocomel 1 liter" -> "Chocomel"). */
  base: string;
  packaging?: Packaging;
  size?: Size;
};

const UNITS: Record<string, { unit: Size["unit"]; factor: number }> = {
  ml: { unit: "ml", factor: 1 },
  cl: { unit: "ml", factor: 10 },
  dl: { unit: "ml", factor: 100 },
  l: { unit: "ml", factor: 1000 },
  ltr: { unit: "ml", factor: 1000 },
  liter: { unit: "ml", factor: 1000 },
  liters: { unit: "ml", factor: 1000 },
  g: { unit: "g", factor: 1 },
  gr: { unit: "g", factor: 1 },
  gram: { unit: "g", factor: 1 },
  grams: { unit: "g", factor: 1 },
  kg: { unit: "g", factor: 1000 },
  kilo: { unit: "g", factor: 1000 },
  kilos: { unit: "g", factor: 1000 },
};

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const plainToken = (token: string) => token.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/(\d),(\d)/g, "$1.$2");

/** "1 liter", "1,5l", "250 ml", "6 x 200 ml", "6x200ml", "4-pack". Null when it is not a pack size. */
export function parseSize(text: string): Size | null {
  const value = plainToken(text).replace(/×/g, "x").replace(/\s+/g, "");
  const match = /^(?:(\d{1,2})x)?(\d{1,4}(?:\.\d{1,2})?)([a-z]+)$/.exec(value);
  const unit = match && Object.hasOwn(UNITS, match[3]) ? UNITS[match[3]] : undefined;
  if (!match || !unit) return null;
  const amount = Math.round(Number(match[2]) * unit.factor);
  if (!amount) return null;
  const count = match[1] ? Number(match[1]) : undefined;
  return count && count > 1 ? { unit: unit.unit, amount, count } : { unit: unit.unit, amount };
}

/**
 * What a parent typed, split into the product and an optional packaging word or pack size. Refuses sentences,
 * phrases and anything with digits that is not a pack size or a percentage ("0% suiker").
 */
export function parseName(input: string): ParsedName | null {
  const name = input.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > MAX_TYPED_LENGTH) return null;
  if (!/\p{L}/u.test(name) || /[^\p{L}\d\s'%,.×-]/u.test(name)) return null;
  const tokens = name.split(" ");
  const base: string[] = [];
  let packaging: Packaging | undefined;
  let size: Size | undefined;
  let count: number | undefined;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const plain = plainToken(token);
    const wrapper = Object.hasOwn(PACKAGING_WORDS, plain) ? PACKAGING_WORDS[plain] : undefined;
    if (!base.length) {
      if (/\d/.test(token) || wrapper) return null;
      base.push(token);
      continue;
    }
    if (wrapper && !packaging) {
      packaging = wrapper;
      continue;
    }
    if (!/\d/.test(token)) {
      base.push(token);
      continue;
    }
    if (/^\d{1,3}%$/.test(plain)) {
      base.push(token);
      continue;
    }
    const pack = /^(\d{1,2})-?pack$/.exec(plain);
    const spaced = /^\d{1,2}$/.test(plain) && /^-?pack$/.test(plainToken(tokens[index + 1] ?? ""));
    if (pack || spaced) {
      if (count) return null;
      count = Number(pack ? pack[1] : plain);
      if (spaced) index += 1;
      continue;
    }
    if (size) return null;
    let used = 0;
    for (let length = Math.min(4, tokens.length - index); length > 0 && !used; length -= 1) {
      const parsed = parseSize(tokens.slice(index, index + length).join(""));
      if (parsed) {
        size = parsed;
        used = length;
      }
    }
    if (!used) return null;
    index += used - 1;
  }
  const words = normalizeName(base.join(" ")).split(" ").filter(Boolean);
  const counted = words.filter((word) => !/^\d+$/.test(word));
  if (!counted.length || counted.length > MAX_WORDS || base.join(" ").length > MAX_LENGTH) return null;
  if (words.some((word) => CONNECTORS.has(word) || VAGUE.has(word))) return null;
  if (count && count > 1 && size && !size.count) size = { ...size, count };
  if ((count && count > 1) || size?.count) packaging ??= "multipack";
  const tidy = (value: string) => value.charAt(0).toLocaleUpperCase("nl") + value.slice(1);
  return { name: tidy(name), base: tidy(base.join(" ")), ...(packaging ? { packaging } : {}), ...(size ? { size } : {}) };
}

/** A name a parent may put on the list: a product, optionally with a packaging word or a pack size. */
export function customName(input: string): string | null {
  return parseName(input)?.name ?? null;
}

/** Only a product name: no digits, no packaging. For names a model writes, which must never carry a quantity. */
export function plainName(input: string): string | null {
  const name = input.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > MAX_LENGTH) return null;
  if (!/\p{L}/u.test(name) || /\d/.test(name) || /[^\p{L}\s'-]/u.test(name)) return null;
  const words = normalizeName(name).split(" ").filter(Boolean);
  if (!words.length || words.length > MAX_WORDS) return null;
  if (words.some((word) => CONNECTORS.has(word) || VAGUE.has(word))) return null;
  return name.charAt(0).toLocaleUpperCase("nl") + name.slice(1);
}

function singularWord(word: string): string {
  if (word.length > 4 && word.endsWith("en")) {
    let stem = word.slice(0, -2);
    if (stem.length >= 2 && stem.at(-1) === stem.at(-2) && !VOWEL.test(stem.at(-1)!)) return stem.slice(0, -1);
    if (stem.endsWith("v")) stem = `${stem.slice(0, -1)}f`;
    else if (stem.endsWith("z")) stem = `${stem.slice(0, -1)}s`;
    const [c1, v, c2] = stem.slice(-3);
    const unstressed = stem.length > 3 && /e[lrnm]$/.test(stem);
    if (stem.length >= 3 && !VOWEL.test(c1) && /[aeou]/.test(v) && !VOWEL.test(c2) && c2 !== "j" && !unstressed) {
      return `${stem.slice(0, -1)}${v}${c2}`;
    }
    return stem;
  }
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("ijs")) {
    if (!VOWEL.test(word.at(-2)!) || !VOWEL.test(word.at(-3)!)) return word.slice(0, -1);
  }
  return word;
}

export function singularKey(name: string): string {
  const words = normalizeName(name).split(" ").filter((word) => word && word !== "s");
  if (!words.length) return "";
  words[words.length - 1] = singularWord(words[words.length - 1]);
  return words.join("-");
}
