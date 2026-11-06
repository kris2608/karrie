import type { Confidence } from "../../domain/types";

export const SHOP_SECTIONS = ["groente-fruit", "bakker", "houdbaar", "koeling", "diepvries", "huishouden"] as const;
export type ShopSection = (typeof SHOP_SECTIONS)[number];

/** Mirrors server/src/schema.ts; the server has already validated it strictly. */
export type RecognizedProduct = {
  recognized: boolean;
  productName: string | null;
  genericName: string | null;
  brand: string | null;
  variant: string | null;
  packageSize: string | null;
  category: ShopSection | null;
  subcategory: string | null;
  ean: string | null;
  visibleNutriScore: string | null;
  visibleClaims: string[];
  inferredFields: string[];
  confidence: Confidence;
  needsConfirmation: boolean;
  containsPeople: boolean;
};

const NULLABLE_TEXT = ["productName", "genericName", "brand", "variant", "packageSize", "subcategory", "ean", "visibleNutriScore"] as const;

export function isRecognizedProduct(value: unknown): value is RecognizedProduct {
  if (!value || typeof value !== "object") return false;
  const product = value as Record<string, unknown>;
  return (
    typeof product.recognized === "boolean" &&
    typeof product.needsConfirmation === "boolean" &&
    typeof product.containsPeople === "boolean" &&
    ["high", "medium", "low"].includes(product.confidence as string) &&
    (product.category === null || SHOP_SECTIONS.includes(product.category as ShopSection)) &&
    Array.isArray(product.visibleClaims) &&
    product.visibleClaims.every((claim) => typeof claim === "string") &&
    Array.isArray(product.inferredFields) &&
    NULLABLE_TEXT.every((key) => product[key] === null || typeof product[key] === "string")
  );
}
