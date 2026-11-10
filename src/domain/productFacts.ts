import { identityOf, type ImageIdentity } from "./imageIdentity";
import type { Nutrition, PackInfo } from "./types";

/**
 * Mirrors ProductFacts on the server: what a shop or brand page says about a branded pack, checked against that
 * page. Kept for healthier-choice missions; nothing here is the model's own knowledge.
 */
export type ProductFacts = {
  nutriScore?: "A" | "B" | "C" | "D" | "E";
  per100?: { unit: "g" | "ml"; energyKcal?: number; fat?: number; saturatedFat?: number; sugars?: number; fibre?: number; protein?: number; salt?: number };
  ingredients?: string;
  allergens?: string[];
  claims?: string[];
  quantity?: string;
  sourceUrl: string;
  sourceName: string;
  readAt: number;
};

type PackFactsItem = Pick<PackInfo, "nutrition" | "ingredients" | "barcode" | "packageSize" | "offAttribution">;

const NUMBERS = ["energyKcal", "fat", "saturatedFat", "sugars", "fibre", "protein", "salt"] as const;
const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);
const list = (value: unknown) => (Array.isArray(value) ? value.map((entry) => text(entry, 60)).filter((entry): entry is string => Boolean(entry)).slice(0, 12) : []);

/** Accepts only the documented shape from the server; anything else is dropped. */
export function cleanFacts(value: unknown): ProductFacts | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const sourceUrl = text(raw.sourceUrl, 500);
  const sourceName = text(raw.sourceName, 80);
  if (!sourceUrl?.startsWith("https://") || !sourceName) return undefined;
  const nutriScore = typeof raw.nutriScore === "string" && /^[A-E]$/.test(raw.nutriScore) ? (raw.nutriScore as ProductFacts["nutriScore"]) : undefined;
  const per100Raw = raw.per100 && typeof raw.per100 === "object" ? (raw.per100 as Record<string, unknown>) : undefined;
  const values = Object.fromEntries(NUMBERS.flatMap((key) => (typeof per100Raw?.[key] === "number" && Number.isFinite(per100Raw[key]) && (per100Raw[key] as number) >= 0 ? [[key, per100Raw[key]]] : [])));
  const per100 = Object.keys(values).length ? { unit: per100Raw?.unit === "ml" ? ("ml" as const) : ("g" as const), ...values } : undefined;
  const allergens = list(raw.allergens);
  const claims = list(raw.claims);
  return {
    ...(nutriScore && { nutriScore }),
    ...(per100 && { per100 }),
    ...(text(raw.ingredients, 600) && { ingredients: text(raw.ingredients, 600) }),
    ...(allergens.length && { allergens }),
    ...(claims.length && { claims }),
    ...(text(raw.quantity, 20) && { quantity: text(raw.quantity, 20) }),
    sourceUrl,
    sourceName,
    readAt: typeof raw.readAt === "number" ? raw.readAt : 0,
  };
}

/** The stored facts for a list item, for missions that suggest a healthier choice. */
export function factsFor(item: Pick<PackInfo, "brand" | "packageSize" | "source" | "recognition"> & { name: string }, lookup: (identity: ImageIdentity) => { discovery?: { facts?: ProductFacts } } | undefined): ProductFacts | undefined {
  const identity = identityOf(item);
  return identity && !identity.generic ? lookup(identity)?.discovery?.facts : undefined;
}

function nutriGrade(value?: string): ProductFacts["nutriScore"] | undefined {
  const grade = value?.trim().toUpperCase();
  return grade && /^[A-E]$/.test(grade) ? (grade as ProductFacts["nutriScore"]) : undefined;
}

function per100FromNutrition(nutrition: Nutrition | undefined): ProductFacts["per100"] | undefined {
  if (!nutrition) return undefined;
  const values = Object.fromEntries(
    (
      [
        ["energyKcal", nutrition.energyKcal100g],
        ["fat", nutrition.fat100g],
        ["saturatedFat", nutrition.saturatedFat100g],
        ["sugars", nutrition.sugars100g],
        ["fibre", nutrition.fiber100g],
        ["protein", nutrition.proteins100g],
        ["salt", nutrition.salt100g],
      ] as const
    ).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value >= 0),
  );
  return Object.keys(values).length ? { unit: "g", ...values } : undefined;
}

/**
 * Build ProductInfo facts from OFF/barcode pack fields already on the item.
 * Used when no shop-page discovery facts are cached.
 */
export function packFactsFromItem(item: PackFactsItem): ProductFacts | undefined {
  const sourceUrl = item.barcode?.sourceUrl;
  const sourceName = item.barcode?.sourceName;
  if (!sourceUrl?.startsWith("https://") || !sourceName) return undefined;
  const nutriScore = nutriGrade(item.nutrition?.nutriscore);
  const per100 = per100FromNutrition(item.nutrition);
  const ingredients = text(item.ingredients, 600);
  if (!nutriScore && !per100 && !ingredients) return undefined;
  return {
    ...(nutriScore && { nutriScore }),
    ...(per100 && { per100 }),
    ...(ingredients && { ingredients }),
    ...(text(item.packageSize, 20) && { quantity: text(item.packageSize, 20) }),
    sourceUrl,
    sourceName,
    readAt: item.barcode?.at ?? 0,
  };
}

/** Prefer shop-page discovery; fall back to OFF/barcode pack nutrition and ingredients. */
export function displayFacts(
  item: PackFactsItem & Pick<PackInfo, "brand" | "packageSize" | "source" | "recognition"> & { name: string },
  pageFacts?: ProductFacts,
): ProductFacts | undefined {
  return pageFacts ?? packFactsFromItem(item);
}
