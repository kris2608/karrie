import { mapCategory, matchType } from "../../domain/productType";
import type { Nutrition, ScannedProduct } from "../../domain/types";

export type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_nl?: string;
  generic_name?: string;
  generic_name_nl?: string;
  brands?: string;
  quantity?: string;
  image_front_url?: string;
  image_url?: string;
  categories_tags?: string[];
  nutriscore_grade?: string;
  nutriments?: Record<string, unknown>;
};

export const OFF_FIELDS = [
  "code",
  "product_name",
  "product_name_nl",
  "generic_name",
  "generic_name_nl",
  "brands",
  "quantity",
  "image_front_url",
  "image_url",
  "categories_tags",
  "nutriscore_grade",
  "nutriments",
];

const IMAGE_HOSTS = new Set(["images.openfoodfacts.org", "static.openfoodfacts.org"]);

function text(value: unknown, max = 80): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function number(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : undefined;
}

export function safeImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && IMAGE_HOSTS.has(url.hostname) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function nutrition(raw: OffProduct): Nutrition | undefined {
  const facts = raw.nutriments ?? {};
  const grade = text(raw.nutriscore_grade)?.toLowerCase();
  const result: Nutrition = {
    nutriscore: grade && /^[a-e]$/.test(grade) ? grade : undefined,
    energyKcal100g: number(facts["energy-kcal_100g"]),
    sugars100g: number(facts.sugars_100g),
    fat100g: number(facts.fat_100g),
    saturatedFat100g: number(facts["saturated-fat_100g"]),
    salt100g: number(facts.salt_100g),
    proteins100g: number(facts.proteins_100g),
    fiber100g: number(facts.fiber_100g),
  };
  const filled = Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined));
  return Object.keys(filled).length ? (filled as Nutrition) : undefined;
}

export function normalizeOffProduct(ean: string, raw: OffProduct): ScannedProduct {
  const categoryTags = Array.isArray(raw.categories_tags)
    ? raw.categories_tags.filter((tag): tag is string => typeof tag === "string").slice(0, 60)
    : [];
  return {
    ean,
    name: text(raw.product_name_nl) ?? text(raw.generic_name_nl) ?? text(raw.product_name) ?? text(raw.generic_name),
    brand: text(raw.brands?.split(",")[0], 40),
    packageSize: text(raw.quantity, 24),
    imageUrl: safeImageUrl(raw.image_front_url) ?? safeImageUrl(raw.image_url),
    categoryTags,
    nutrition: nutrition(raw),
    category: mapCategory(categoryTags),
    matchProductId: matchType({ categoryTags })?.id,
  };
}
