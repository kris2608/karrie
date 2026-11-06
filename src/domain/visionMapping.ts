import { products } from "../data/catalog";
import type { VisionPack } from "../data/sample";
import type { RecognizedProduct, ShopSection } from "../services/vision/types";
import { categoryIcon } from "./categoryIcon";
import { canonicalEan, isValidEan } from "./ean";
import { normalize } from "./matchProduct";
import type { CategoryId, Product } from "./types";

export const SECTION_CATEGORY: Record<ShopSection, CategoryId> = {
  "groente-fruit": "produce",
  bakker: "bakery",
  houdbaar: "pantry",
  koeling: "dairy",
  diepvries: "frozen",
  huishouden: "household",
};

/**
 * A catalog product whose name or alias equals the recognised type exactly.
 * Used to pick a drawing and to suggest list items, never to replace one.
 */
export function catalogMatch(product: RecognizedProduct): Product | null {
  const wanted = [product.subcategory, product.genericName]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalize(value).replace(/\s/g, ""))
    .filter(Boolean);
  for (const name of wanted) {
    const hit = products.find((entry) => [entry.name, ...entry.aliases].some((alias) => normalize(alias).replace(/\s/g, "") === name));
    if (hit) return hit;
  }
  return null;
}

/** A barcode the model read off the pack; only a hint until Open Food Facts and a parent confirm it. */
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
  pack: VisionPack;
};

export function draftFromVision(product: RecognizedProduct): VisionDraft {
  const match = catalogMatch(product);
  const category = (product.category && SECTION_CATEGORY[product.category]) ?? match?.category ?? "pantry";
  const inferred = new Set(product.inferredFields);
  return {
    name: product.productName ?? product.genericName ?? match?.name ?? "",
    category,
    icon: match?.id ?? categoryIcon(category),
    match,
    pack: {
      brand: product.brand && !inferred.has("brand") ? product.brand : undefined,
      packageSize: product.packageSize && !inferred.has("packageSize") ? product.packageSize : undefined,
      recognition: {
        genericName: product.genericName ?? undefined,
        variant: product.variant ?? undefined,
        subcategory: product.subcategory ?? undefined,
        claims: product.visibleClaims.length ? product.visibleClaims : undefined,
        nutriScoreSeen: product.visibleNutriScore ?? undefined,
        confidence: product.confidence,
        inferred: product.inferredFields.length ? product.inferredFields : undefined,
      },
    },
  };
}
