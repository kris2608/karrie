/** Same rules as src/domain/customProduct.ts in the app; a name the app refuses must be refused here too. */

const MAX_LENGTH = 32;
const MAX_WORDS = 3;
const CONNECTORS = new Set(["voor", "met", "van", "en", "of", "zonder", "uit"]);
const VAGUE = new Set(["ding", "dingen", "spul", "spullen", "iets", "boodschappen", "product", "producten"]);
const VOWEL = /[aeiouy]/;

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function customName(input: string): string | null {
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
