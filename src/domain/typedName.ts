import { normalize } from "./matchProduct";

/** Same rules as server/src/productName.ts; a name the app accepts must be accepted there too. */

const MAX_LENGTH = 32;
const MAX_TYPED_LENGTH = 40;
const MAX_WORDS = 3;
/** Words that turn a product into a phrase ("dingen voor ontbijt", "brood met kaas"). */
export const CONNECTORS = new Set(["voor", "met", "van", "en", "of", "zonder", "uit"]);
export const VAGUE = new Set(["ding", "dingen", "spul", "spullen", "iets", "boodschappen", "product", "producten"]);

export type Packaging = "can" | "bottle" | "carton" | "jar" | "bag" | "tube" | "multipack";

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

const plainToken = (token: string) => token.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/(\d),(\d)/g, "$1.$2");

/** "1 liter", "1,5l", "250 ml", "6 x 200 ml", "6x200ml". Null when it is not a pack size. */
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
  const words = normalize(base.join(" ")).split(" ").filter(Boolean);
  const counted = words.filter((word) => !/^\d+$/.test(word));
  if (!counted.length || counted.length > MAX_WORDS || base.join(" ").length > MAX_LENGTH) return null;
  if (words.some((word) => CONNECTORS.has(word) || VAGUE.has(word))) return null;
  if (count && count > 1 && size && !size.count) size = { ...size, count };
  if ((count && count > 1) || size?.count) packaging ??= "multipack";
  const tidy = (value: string) => value.charAt(0).toLocaleUpperCase("nl") + value.slice(1);
  return { name: tidy(name), base: tidy(base.join(" ")), ...(packaging ? { packaging } : {}), ...(size ? { size } : {}) };
}

/** How a pack size reads on a label: "1 l", "250 ml", "6 x 200 ml", "500 g". */
export function sizeLabel(size: Size): string {
  const one = size.unit === "ml" && size.amount >= 1000 ? `${String(size.amount / 1000).replace(".", ",")} l` : size.unit === "g" && size.amount >= 1000 ? `${String(size.amount / 1000).replace(".", ",")} kg` : `${size.amount} ${size.unit}`;
  return size.count ? `${size.count} x ${one}` : one;
}
