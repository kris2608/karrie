import type { Confidence, Criterion } from "../../domain/types";

export const SHOP_SECTIONS = ["groente-fruit", "bakker", "houdbaar", "koeling", "diepvries", "huishouden"] as const;
export type ShopSection = (typeof SHOP_SECTIONS)[number];

const ALTERNATIVE_STATUS = ["none", "possible", "insufficient-data"] as const;
const EVIDENCE = ["label", "inferred", "none"] as const;

export type RecognizedAlternative = {
  status: (typeof ALTERNATIVE_STATUS)[number];
  evidence: (typeof EVIDENCE)[number];
  criteria: Criterion[];
  alternativeType: string | null;
  targetType: string | null;
  reason: string | null;
  parentExplanation: string | null;
  childPrompt: string | null;
};

/** Mirrors server/src/schema.ts; the server has already validated it strictly. */
export type RecognizedProduct = {
  recognized: boolean;
  productName: string | null;
  genericName: string | null;
  catalogType: string | null;
  specificProduct: boolean;
  brand: string | null;
  variant: string | null;
  packageSize: string | null;
  category: ShopSection | null;
  subcategory: string | null;
  ean: string | null;
  visibleNutriScore: string | null;
  visibleClaims: string[];
  visibleIngredients: string | null;
  inferredFields: string[];
  confidence: Confidence;
  needsConfirmation: boolean;
  containsPeople: boolean;
  alternative: RecognizedAlternative;
};

const NULLABLE_TEXT = ["productName", "genericName", "catalogType", "brand", "variant", "packageSize", "subcategory", "ean", "visibleNutriScore", "visibleIngredients"] as const;
const ALTERNATIVE_TEXT = ["alternativeType", "targetType", "reason", "parentExplanation", "childPrompt"] as const;

function isText(value: unknown) {
  return value === null || typeof value === "string";
}

function isAlternative(value: unknown): value is RecognizedAlternative {
  if (!value || typeof value !== "object") return false;
  const alternative = value as Record<string, unknown>;
  return (
    ALTERNATIVE_STATUS.includes(alternative.status as RecognizedAlternative["status"]) &&
    EVIDENCE.includes(alternative.evidence as RecognizedAlternative["evidence"]) &&
    Array.isArray(alternative.criteria) &&
    alternative.criteria.every((criterion) => typeof criterion === "string") &&
    ALTERNATIVE_TEXT.every((key) => isText(alternative[key]))
  );
}

export function isRecognizedProduct(value: unknown): value is RecognizedProduct {
  if (!value || typeof value !== "object") return false;
  const product = value as Record<string, unknown>;
  return (
    typeof product.recognized === "boolean" &&
    typeof product.specificProduct === "boolean" &&
    typeof product.needsConfirmation === "boolean" &&
    typeof product.containsPeople === "boolean" &&
    ["high", "medium", "low"].includes(product.confidence as string) &&
    (product.category === null || SHOP_SECTIONS.includes(product.category as ShopSection)) &&
    Array.isArray(product.visibleClaims) &&
    product.visibleClaims.every((claim) => typeof claim === "string") &&
    Array.isArray(product.inferredFields) &&
    NULLABLE_TEXT.every((key) => isText(product[key])) &&
    isAlternative(product.alternative)
  );
}
