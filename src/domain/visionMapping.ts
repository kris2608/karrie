import { productById, products } from "../data/catalog";
import type { VisionPack } from "../data/sample";
import type { RecognizedProduct, ShopSection } from "../services/vision/types";
import { categoryIcon } from "./categoryIcon";
import { resolveAssessment } from "./discovery";
import { canonicalEan, isValidEan } from "./ean";
import { normalize } from "./matchProduct";
import type { CategoryId, Product } from "./types";

export const SECTION_CATEGORY: Record<ShopSection, CategoryId> = {
  "groente-fruit": "produce",
  bakker: "bakery",
  "vlees-vis-vega": "meat",
  ontbijt: "breakfast",
  houdbaar: "pantry",
  koeling: "dairy",
  dranken: "drinks",
  diepvries: "frozen",
  huishouden: "household",
};

const compact = (value: string) => normalize(value).replace(/\s/g, "");

/**
 * A catalog product whose name or alias equals the recognised type exactly,
 * else the type the model picked. Used for the drawing and list suggestions only.
 */
export function catalogMatch(product: RecognizedProduct): Product | null {
  const wanted = [product.subcategory, product.genericName]
    .filter((value): value is string => Boolean(value))
    .map(compact)
    .filter(Boolean);
  for (const name of wanted) {
    const hit = products.find((entry) => [entry.name, ...entry.aliases].some((alias) => compact(alias) === name));
    if (hit) return hit;
  }
  // The model sometimes forces a near type (chocopasta -> jam); its pick must also appear in what it read.
  const picked = product.catalogType ? productById(product.catalogType) : undefined;
  const read = [product.productName, ...wanted].filter((value): value is string => Boolean(value)).map(compact).join(" ");
  return picked && [picked.name, ...picked.aliases].some((alias) => read.includes(compact(alias))) ? picked : null;
}

/** A barcode the model read off the pack: kept as a hint, never used as the product's EAN. */
export function visibleEan(product: RecognizedProduct): string | null {
  return product.ean && isValidEan(product.ean) ? canonicalEan(product.ean) : null;
}

export function needsCheck(product: RecognizedProduct): boolean {
  return !product.recognized || product.needsConfirmation || product.confidence === "low";
}

export type VisionDraft = {
  name: string;
  category: CategoryId;
  icon: string;
  match: Product | null;
  /** A branded pack is shown as the photo; loose bread or fruit keeps its drawing. */
  keepPhoto: boolean;
  pack: VisionPack;
};

export function draftFromVision(product: RecognizedProduct): VisionDraft {
  const match = catalogMatch(product);
  /** Prefer the catalog department when we matched a drawing; otherwise use the shop section from the photo. */
  const category = match?.category ?? (product.category && SECTION_CATEGORY[product.category]) ?? "pantry";
  const inferred = new Set(product.inferredFields);
  const ingredients = product.visibleIngredients ?? undefined;
  return {
    name: product.productName ?? product.genericName ?? match?.name ?? "",
    category,
    icon: match?.id ?? categoryIcon(category),
    match,
    keepPhoto: product.specificProduct || !match,
    pack: {
      brand: product.brand && !inferred.has("brand") ? product.brand : undefined,
      packageSize: product.packageSize && !inferred.has("packageSize") ? product.packageSize : undefined,
      recognition: {
        genericName: product.genericName ?? undefined,
        variant: product.variant ?? undefined,
        subcategory: product.subcategory ?? undefined,
        claims: product.visibleClaims.length ? product.visibleClaims : undefined,
        nutriScoreSeen: product.visibleNutriScore ?? undefined,
        ingredientsSeen: ingredients,
        eanCandidate: visibleEan(product) ?? undefined,
        specific: product.specificProduct,
        confidence: product.confidence,
        inferred: product.inferredFields.length ? product.inferredFields : undefined,
      },
      alternative: resolveAssessment(product.alternative, match?.id, ingredients),
    },
  };
}
