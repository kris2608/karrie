import type { ProductFacts } from "./productFacts";
import type { AdventureItem, Nutrition, PackInfo } from "./types";

export type EvidenceSource = "off" | "page" | "photo" | "none";
export type MatchConfidence = "exact" | "likely" | "weak";

/** Assembled facts for a healthier-alternative check. Never mixes variants. */
export type ProductEvidence = {
  productId?: string;
  gtin?: string;
  name: string;
  brand?: string;
  packageSize?: string;
  formulation?: string;
  ingredients?: string;
  nutrition?: Nutrition;
  nutriScore?: string;
  nutritionUnit?: "g" | "ml";
  ingredientsSource: EvidenceSource;
  nutritionSource: Exclude<EvidenceSource, "photo">;
  matchConfidence: MatchConfidence;
  evidenceVersion: string;
};

export type EvidenceInput = Pick<AdventureItem, "name"> &
  Partial<
    Pick<
      AdventureItem,
      | "productId"
      | "brand"
      | "packageSize"
      | "ean"
      | "nutrition"
      | "ingredients"
      | "recognition"
      | "barcode"
      | "kind"
      | "source"
      | "imageKind"
      | "id"
      | "icon"
      | "category"
      | "quantity"
      | "status"
    >
  > &
  Partial<PackInfo>;

function clip(value: string | undefined, max: number): string | undefined {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
}

function nutritionFromFacts(facts: ProductFacts | undefined): { nutrition?: Nutrition; unit?: "g" | "ml"; nutriScore?: string } {
  if (!facts) return {};
  const per = facts.per100;
  const nutrition: Nutrition = {
    ...(facts.nutriScore && { nutriscore: facts.nutriScore.toLowerCase() }),
    ...(per?.energyKcal !== undefined && { energyKcal100g: per.energyKcal }),
    ...(per?.sugars !== undefined && { sugars100g: per.sugars }),
    ...(per?.fat !== undefined && { fat100g: per.fat }),
    ...(per?.saturatedFat !== undefined && { saturatedFat100g: per.saturatedFat }),
    ...(per?.salt !== undefined && { salt100g: per.salt }),
    ...(per?.protein !== undefined && { proteins100g: per.protein }),
    ...(per?.fibre !== undefined && { fiber100g: per.fibre }),
  };
  const filled = Object.fromEntries(Object.entries(nutrition).filter(([, value]) => value !== undefined));
  return {
    ...(Object.keys(filled).length ? { nutrition: filled as Nutrition } : {}),
    ...(per?.unit && { unit: per.unit }),
    ...(facts.nutriScore && { nutriScore: facts.nutriScore }),
  };
}

function hashEvidence(parts: Record<string, string | undefined>): string {
  const body = Object.keys(parts)
    .sort()
    .map((key) => `${key}=${parts[key] ?? ""}`)
    .join("|");
  let hash = 2166136261;
  for (let i = 0; i < body.length; i += 1) {
    hash ^= body.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Prefer OFF (verified GTIN), then page facts for branded packs, then photo-read ingredients.
 * Never attributes one variant's facts to another.
 */
export function assembleProductEvidence(item: EvidenceInput, pageFacts?: ProductFacts): ProductEvidence {
  const name = clip(item.name, 80) || "Product";
  const brand = clip(item.brand, 40);
  const packageSize = clip(item.packageSize, 24);
  const formulation = clip(item.recognition?.variant, 40);
  const gtin = item.ean?.replace(/\D/g, "");
  const offExact = item.barcode?.status === "off-exact" || (gtin && item.ingredients && item.nutrition);
  const page = pageFacts && brand ? pageFacts : undefined;

  let ingredients: string | undefined;
  let ingredientsSource: EvidenceSource = "none";
  if (clip(item.ingredients, 600) && (offExact || item.barcode?.status === "off-exact" || item.barcode?.status === "off-partial")) {
    ingredients = clip(item.ingredients, 600);
    ingredientsSource = "off";
  } else if (page?.ingredients) {
    ingredients = clip(page.ingredients, 600);
    ingredientsSource = "page";
  } else if (clip(item.recognition?.ingredientsSeen, 600)) {
    ingredients = clip(item.recognition?.ingredientsSeen, 600);
    ingredientsSource = "photo";
  } else if (clip(item.ingredients, 600)) {
    ingredients = clip(item.ingredients, 600);
    ingredientsSource = item.barcode ? "off" : "none";
  }

  let nutrition = item.nutrition;
  let nutritionSource: ProductEvidence["nutritionSource"] = nutrition ? "off" : "none";
  let nutritionUnit: "g" | "ml" | undefined;
  let nutriScore = item.nutrition?.nutriscore?.toUpperCase();
  if (!nutrition && page) {
    const fromPage = nutritionFromFacts(page);
    nutrition = fromPage.nutrition;
    nutritionUnit = fromPage.unit;
    nutriScore = fromPage.nutriScore ?? nutriScore;
    if (nutrition) nutritionSource = "page";
  } else if (nutrition) {
    nutritionSource = "off";
  }

  let matchConfidence: MatchConfidence = "weak";
  if (item.kind === "custom_generic" || (item.source === "manual" && !gtin && !ingredients && !nutrition)) {
    matchConfidence = "weak";
  } else if (item.barcode?.status === "off-exact" || (gtin && ingredientsSource === "off")) {
    matchConfidence = "exact";
  } else if (ingredientsSource === "page" || ingredientsSource === "photo" || (gtin && nutrition)) {
    matchConfidence = "likely";
  } else if (item.productId && !brand && !gtin && !ingredients) {
    matchConfidence = "weak";
  }

  const evidenceVersion = hashEvidence({
    productId: item.productId,
    gtin,
    name,
    brand,
    packageSize,
    formulation,
    ingredients,
    nutrition: nutrition ? JSON.stringify(nutrition) : undefined,
    ingredientsSource,
    nutritionSource,
  });

  return {
    ...(item.productId && { productId: item.productId }),
    ...(gtin && gtin.length >= 8 && { gtin }),
    name,
    ...(brand && { brand }),
    ...(packageSize && { packageSize }),
    ...(formulation && { formulation }),
    ...(ingredients && { ingredients }),
    ...(nutrition && { nutrition }),
    ...(nutriScore && { nutriScore }),
    ...(nutritionUnit && { nutritionUnit }),
    ingredientsSource,
    nutritionSource,
    matchConfidence,
    evidenceVersion,
  };
}

/** Enough trusted signal to ask for (or rule out) a healthier alternative. */
export function isAssessable(evidence: ProductEvidence): boolean {
  if (evidence.matchConfidence === "weak") return false;
  if (evidence.ingredients) return true;
  const n = evidence.nutrition;
  return Boolean(n && (n.sugars100g !== undefined || n.salt100g !== undefined || n.fiber100g !== undefined || n.saturatedFat100g !== undefined));
}

/** Bare catalog generics without formulation evidence must not be treated as less-healthy. */
export function isBareGeneric(item: EvidenceInput): boolean {
  if (item.kind === "custom_generic") return true;
  const hasFormulation = Boolean(item.ean || item.brand || item.ingredients || item.recognition?.ingredientsSeen || item.nutrition);
  return Boolean(item.productId) && !hasFormulation;
}
