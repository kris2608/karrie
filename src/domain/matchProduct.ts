import type { Product } from "./types";

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = i - 1;
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = row[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
      previous = saved;
    }
  }
  return row[right.length];
}

function scoreName(query: string, name: string): number {
  if (!name) return 0;
  if (name === query || name.replace(/\s/g, "") === query.replace(/\s/g, "")) return 100;
  const shortest = Math.min(name.length, query.length);
  if (shortest >= 4 && (query.includes(name) || name.includes(query))) return 80;
  const limit = query.length >= 6 ? 2 : query.length >= 4 ? 1 : 0;
  if (!limit) return 0;
  const distance = levenshtein(query, name);
  if (distance <= 0 || distance > limit) return 0;
  return distance === 1 ? 70 : 60;
}

export function matchProduct(query: string, products: Product[]): Product | null {
  const normalized = normalize(query);
  if (normalized.length < 2) return null;

  const scored = products
    .map((product) => {
      const names = [product.name, ...product.aliases].map(normalize);
      const score = names.reduce((best, name) => Math.max(best, scoreName(normalized, name)), 0);
      return { product, score };
    })
    .filter((entry) => entry.score >= 60)
    .sort((a, b) => b.score - a.score);

  const [best, next] = scored;
  if (!best) return null;
  if (next && next.score === best.score && best.score < 100) return null;
  return best.product;
}
