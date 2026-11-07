import { products } from "../data/catalog";
import { matchProduct, normalize } from "./matchProduct";
import type { Product, SavedItem } from "./types";

const MAX_LENGTH = 32;
const MAX_WORDS = 3;
/** Words that turn a product into a phrase ("dingen voor ontbijt", "brood met kaas"). */
const CONNECTORS = new Set(["voor", "met", "van", "en", "of", "zonder", "uit"]);
const VAGUE = new Set(["ding", "dingen", "spul", "spullen", "iets", "boodschappen", "product", "producten"]);

/** A tidy product name from what the parent typed, or null when it is not something to put on a list. */
export function customName(input: string): string | null {
  const name = input.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > MAX_LENGTH) return null;
  if (!/\p{L}/u.test(name) || /\d/.test(name) || /[^\p{L}\s'-]/u.test(name)) return null;
  const words = normalize(name).split(" ").filter(Boolean);
  if (!words.length || words.length > MAX_WORDS) return null;
  if (words.some((word) => CONNECTORS.has(word) || VAGUE.has(word))) return null;
  return name.charAt(0).toLocaleUpperCase("nl") + name.slice(1);
}

const VOWEL = /[aeiouy]/;

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
    const before = word.at(-2)!;
    const twoBefore = word.at(-3)!;
    if (!VOWEL.test(before) || !VOWEL.test(twoBefore)) return word.slice(0, -1);
  }
  return word;
}

/** One key for singular and plural ("walnoot", "walnoten"), so the same product is never created twice. */
export function singularKey(name: string): string {
  const words = normalize(name).split(" ").filter((word) => word && word !== "s");
  if (!words.length) return "";
  words[words.length - 1] = singularWord(words[words.length - 1]);
  return words.join("-");
}

export function customProductId(name: string): string {
  return `custom:${singularKey(name)}`;
}

export type Suggestion = { kind: "catalog"; product: Product; close: boolean } | { kind: "mine"; entry: SavedItem };

/**
 * An existing product for what the parent typed: the catalog (exact, then singular/plural, then a typo),
 * then a product this device already made. `close` marks a typo match, which is only a suggestion.
 */
export function suggestion(query: string, mine: SavedItem[]): Suggestion | null {
  const needle = normalize(query);
  if (needle.length < 2) return null;
  const names = (product: Product) => [product.name, ...product.aliases];
  const exact = products.find((product) => names(product).some((name) => normalize(name) === needle));
  if (exact) return { kind: "catalog", product: exact, close: false };
  const key = singularKey(query);
  const sameWord = products.find((product) => names(product).some((name) => singularKey(name) === key));
  if (sameWord) return { kind: "catalog", product: sameWord, close: false };
  const own = mine.find((entry) => entry.productId === `custom:${key}` || singularKey(entry.name) === key);
  if (own) return { kind: "mine", entry: own };
  const typo = matchProduct(query, products);
  return typo ? { kind: "catalog", product: typo, close: true } : null;
}
