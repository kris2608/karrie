import type { Confidence, Criterion } from "../../domain/types";

export const SHOP_SECTIONS = [
  "groente-fruit",
  "bakker",
  "vlees-vis-vega",
  "ontbijt",
  "houdbaar",
  "koeling",
  "dranken",
  "diepvries",
  "huishouden",
] as const;
export type ShopSection = (typeof SHOP_SECTIONS)[number];

const ALTERNATIVE_STATUS = ["none", "possible", "insufficient-data"] as const;
const EVIDENCE = ["label", "inferred", "none"] as const;
export const RECOGNITION_OUTCOMES = ["single", "multiple", "uncertain", "none"] as const;
export type RecognitionOutcome = (typeof RECOGNITION_OUTCOMES)[number];

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

/** One visually observed product; provider identity is optional and never a verified EAN. */
export type VisualCandidate = {
  observedCandidateId: string;
  productName: string | null;
  genericName: string | null;
  catalogType: string | null;
  specificProduct: boolean;
  brand: string | null;
  variant: string | null;
  packageSize: string | null;
  category: ShopSection | null;
  subcategory: string | null;
  /** Hint only — never used as pack.ean without exact-identity confirmation. */
  ean: string | null;
  inferredFields: string[];
  confidence: Confidence;
  imageUrl?: string;
  identity?: {
    productName: string;
    brand?: string;
    packaging?: string;
    imageUrl: string;
    confidence: "high" | "medium";
    source: "prijsprofeet" | "off";
    score?: number;
  };
};

const NULLABLE_TEXT = ["productName", "genericName", "catalogType", "brand", "variant", "packageSize", "subcategory", "ean", "visibleNutriScore", "visibleIngredients"] as const;
const ALTERNATIVE_TEXT = ["alternativeType", "targetType", "reason", "parentExplanation", "childPrompt"] as const;
const CANDIDATE_TEXT = ["productName", "genericName", "catalogType", "brand", "variant", "packageSize", "subcategory", "ean"] as const;

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

export function isVisualCandidate(value: unknown): value is VisualCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.observedCandidateId === "string" &&
    typeof candidate.specificProduct === "boolean" &&
    ["high", "medium", "low"].includes(candidate.confidence as string) &&
    (candidate.category === null || SHOP_SECTIONS.includes(candidate.category as ShopSection)) &&
    Array.isArray(candidate.inferredFields) &&
    CANDIDATE_TEXT.every((key) => isText(candidate[key]))
  );
}

const EMPTY_ALTERNATIVE: RecognizedAlternative = {
  status: "none",
  evidence: "none",
  criteria: [],
  alternativeType: null,
  targetType: null,
  reason: null,
  parentExplanation: null,
  childPrompt: null,
};

/** Turn a selected visual candidate into RecognizedProduct without borrowing another product's evidence. */
export function productFromCandidate(candidate: VisualCandidate): RecognizedProduct {
  return {
    recognized: true,
    productName: candidate.productName,
    genericName: candidate.genericName,
    catalogType: candidate.catalogType,
    specificProduct: candidate.specificProduct,
    brand: candidate.brand,
    variant: candidate.variant,
    packageSize: candidate.packageSize,
    category: candidate.category,
    subcategory: candidate.subcategory,
    ean: candidate.ean,
    visibleNutriScore: null,
    visibleClaims: [],
    visibleIngredients: null,
    inferredFields: candidate.inferredFields,
    confidence: candidate.confidence,
    needsConfirmation: candidate.confidence === "low",
    containsPeople: false,
    alternative: EMPTY_ALTERNATIVE,
  };
}
