import { z } from "zod";

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
export const INFERABLE_FIELDS = ["productName", "genericName", "brand", "variant", "packageSize", "category", "subcategory"] as const;

/** Karrie's food catalog ids (src/data/catalog.ts). Each has a drawing. */
export const FOOD_TYPES = [
  "appel", "banaan", "peer", "sinaasappel", "aardbei", "druiven", "mandarijn", "citroen", "kiwi", "tomaat", "komkommer", "paprika",
  "wortel", "broccoli", "sla", "avocado", "aardappel", "aardappeltjes", "ui", "knoflook", "champignons", "courgette", "aubergine",
  "sperziebonen", "prei", "verse-spinazie", "wokgroenten", "pastagroenten",
  "brood", "bolletjes", "krentenbollen", "croissant", "stokbrood",
  "kipfilet", "gehakt", "zalm", "vegaburger",
  "beschuit", "crackers", "havermout", "pindakaas", "noten", "jam", "hagelslag", "muesli", "honing", "appelstroop",
  "pasta", "rijst", "tomatenpuree", "soep", "olijfolie", "bloem", "suiker", "koekjes", "chips", "pastasaus", "mais",
  "augurk", "olijven", "babyvoeding",
  "melk", "yoghurt", "kwark", "kaas", "mozzarella", "feta", "boter", "eieren", "vla", "karnemelk", "roomkaas",
  "koffie", "thee", "sinaasappelsap", "water", "drinkpakje", "frisdrank", "siroop",
  "ijs", "pizza", "vissticks", "spinazie", "bessen", "kant-en-klaar",
] as const;
export const HOUSEHOLD_TYPES = [
  "toiletpapier", "keukenpapier", "afwasmiddel", "wasmiddel", "vuilniszakken", "handzeep", "tandpasta", "shampoo", "schoonmaakmiddel", "vaatwastabletten", "luiers",
] as const;
export const CATALOG_TYPES = [...FOOD_TYPES, ...HOUSEHOLD_TYPES] as const;

export const CRITERIA = ["no-added-sugar", "no-added-salt", "unsalted", "wholegrain", "less-sugar", "more-fibre", "less-saturated-fat"] as const;

export const AlternativeSchema = z
  .object({
    status: z
      .enum(["none", "possible", "insufficient-data"])
      .describe("possible: a comparable product of the same type is meaningfully better. none: already a good choice, marginal, unrelated or not food. insufficient-data: not enough evidence."),
    evidence: z
      .enum(["label", "inferred", "none"])
      .describe("label: the reason is printed and readable on this photo (ingredients or nutrition table). inferred: only your general knowledge of this product. none: no basis."),
    criteria: z.array(z.enum(CRITERIA)).describe("What the better product has. Empty unless status is possible."),
    alternativeType: z.string().nullable().describe("Short Dutch description of what to look for, e.g. '100% pindakaas zonder toegevoegd zout of suiker'."),
    targetType: z.enum(FOOD_TYPES).nullable().describe("Catalog type of the better product. Normally the same type as this product."),
    reason: z.string().nullable().describe("Short Dutch reason, also when there is no suggestion, e.g. 'Geen duidelijk beter vergelijkbaar product.'"),
    parentExplanation: z.string().nullable().describe("One short Dutch sentence for the parent. State facts only when read on the label, otherwise say 'waarschijnlijk'. No numbers unless read on the label."),
    childPrompt: z.string().nullable().describe("Dutch question for a child of 2 to 6, at most 8 words, e.g. \"Kun jij pindakaas met alleen pinda's vinden?\"."),
  })
  .strict();

/**
 * Strict Structured Outputs only accept a subset of JSON Schema: every field
 * is required, missing values are explicit nulls and objects are closed.
 */
export const RecognizedProductSchema = z
  .object({
    recognized: z.boolean().describe("True when one main grocery or household product is identifiable."),
    productName: z.string().nullable().describe("Product name as printed on the pack, in Dutch where printed in Dutch."),
    genericName: z.string().nullable().describe("Short generic Dutch product type, e.g. 'pindakaas', 'melk', 'appels'."),
    catalogType: z
      .enum(CATALOG_TYPES)
      .nullable()
      .describe("The Karrie catalog type that is this same kind of product, or null. Never a merely similar type: chocolate spread is not jam, oat milk is not melk."),
    specificProduct: z.boolean().describe("True when a specific branded package is visible. False for loose or unbranded products such as bakery bread, fruit or vegetables."),
    brand: z.string().nullable().describe("Brand exactly as printed. Null when not readable."),
    variant: z.string().nullable().describe("Flavour or variant as printed, e.g. 'naturel'. Null when not readable."),
    packageSize: z.string().nullable().describe("Weight or volume only if printed and readable, e.g. '350 g'."),
    category: z.enum(SHOP_SECTIONS).nullable().describe("Supermarket section in a Dutch store."),
    subcategory: z.string().nullable().describe("Lowercase Dutch product type used for matching, e.g. 'pindakaas'."),
    ean: z.string().nullable().describe("Barcode digits only if the barcode numbers are fully readable. Never guess."),
    visibleNutriScore: z.enum(["A", "B", "C", "D", "E"]).nullable().describe("Nutri-Score letter only if visible."),
    visibleClaims: z.array(z.string()).describe("Short claims printed on the pack, at most five."),
    visibleIngredients: z.string().nullable().describe("The ingredient list exactly as printed, only if it is readable on this photo."),
    inferredFields: z.array(z.enum(INFERABLE_FIELDS)).describe("Only fields whose value is NOT printed on the pack and was guessed from shape, colour or context. Leave out every field copied from visible text, such as a brand name on the label. Often empty."),
    confidence: z.enum(["high", "medium", "low"]),
    needsConfirmation: z.boolean().describe("True when a parent should check the result, always for low confidence or ambiguity."),
    containsPeople: z.boolean().describe("True when a face or body of a person is visible. A hand or fingers holding the product do not count."),
    alternative: AlternativeSchema,
  })
  .strict();

export type RecognizedProduct = z.infer<typeof RecognizedProductSchema>;
export type Alternative = z.infer<typeof AlternativeSchema>;

/**
 * One visually observed product or flavour in the photo. Distinct from provider SKU identity.
 * No healthier-alternative assessment here; that stays on the primary product only.
 */
export const VisualCandidateSchema = z
  .object({
    observedCandidateId: z.string().describe("Stable id for this visible product in the photo, e.g. 'c1'."),
    productName: z.string().nullable().describe("Product name as printed, in Dutch where printed in Dutch."),
    genericName: z.string().nullable().describe("Short generic Dutch product type, e.g. 'pindakaas', 'melk'."),
    catalogType: z
      .enum(CATALOG_TYPES)
      .nullable()
      .describe("Exact Karrie catalog type, or null. Never a merely similar type."),
    specificProduct: z.boolean().describe("True when a specific branded package is visible."),
    brand: z.string().nullable().describe("Brand exactly as printed. Null when not readable."),
    variant: z.string().nullable().describe("Flavour or variant as printed. Null when not readable or unclear."),
    packageSize: z.string().nullable().describe("Weight or volume only if printed and readable."),
    category: z.enum(SHOP_SECTIONS).nullable().describe("Supermarket section in a Dutch store."),
    subcategory: z.string().nullable().describe("Lowercase Dutch product type used for matching."),
    ean: z.string().nullable().describe("Barcode digits only if fully readable on this pack. Never guess."),
    inferredFields: z.array(z.enum(INFERABLE_FIELDS)).describe("Fields guessed rather than read from the pack."),
    confidence: z.enum(["high", "medium", "low"]),
  })
  .strict();

export type VisualCandidate = z.infer<typeof VisualCandidateSchema>;

export const RECOGNITION_OUTCOMES = ["single", "multiple", "uncertain", "none"] as const;
export type RecognitionOutcome = (typeof RECOGNITION_OUTCOMES)[number];

/** OpenAI structured output: one primary product (back-compat) plus distinct visual candidates. */
export const RecognizeVisionSchema = z
  .object({
    recognitionOutcome: z
      .enum(RECOGNITION_OUTCOMES)
      .describe("single: one clear product. multiple: 2–5 distinct visible products or flavours. uncertain: best guess needs a parent check. none: no grocery product found."),
    needsSelection: z.boolean().describe("True when the parent should pick among candidates before adding."),
    primary: RecognizedProductSchema.describe("Best single answer for older clients. When multiple flavours share a family, prefer a shared family name with needsConfirmation."),
    candidates: z
      .array(VisualCandidateSchema)
      .describe("0–5 distinct visually supported products. Separate visible flavours/sizes. Deduplicate two photos of the same SKU. Do not invent neighbours that are not clearly intended."),
  })
  .strict();

export type RecognizeVision = z.infer<typeof RecognizeVisionSchema>;

/** Shared healthier-alternative rules for photo recognition and text evidence assessment. */
export const HEALTHIER_RULES = `- The alternative must serve the same shopping purpose and keep the product type and its use. Examples: regular peanut butter -> 100% peanut butter without added sugar or salt; white bread -> wholegrain bread; sweetened yoghurt -> comparable yoghurt without added sugar; sugary cereal -> similar cereal with less sugar and more fibre; salted nuts -> unsalted nuts.
- Never suggest a different food: not peanut butter -> hummus, biscuits -> carrots, chocolate spread -> apples, milk -> water. A different flavour, dairy-free or reduced-fat version is not automatically better.
- Return status "none" when the product is already a strong choice in its category (for example peanut butter of 100% peanuts), when the gain is marginal or depends on context, when allergens or diet suitability are uncertain, when evidence is contradictory, and always for non-food.
- Return "insufficient-data" when the evidence does not support a clear improvement. Do not force a suggestion; no suggestion is a normal, good outcome.
- Use ingredients, added sugar, salt, fibre, wholegrain status and saturated fat. Never compare on calories alone. Nutri-Score is only supplementary. Never invent ingredients, nutritional values, barcodes or brands.
- Distinguish naturally occurring sugar (fruit, milk) from added sugar when ingredients are present.
- Set evidence "label" only when ingredients or a nutrition table were provided in the evidence; otherwise "inferred", and then use qualified wording such as "waarschijnlijk".
- Do not mention numbers unless they appear in the evidence. Do not call food good, bad, healthy or unhealthy in the child prompt.
- Prefer targetType from the Karrie food catalog for the same product type.`;

export const HEALTHIER_RULES_VERSION = "2026-11-09";

export const HEALTHIER_INSTRUCTIONS = `You assess whether a Dutch grocery product has a meaningful healthier alternative of the same shopping purpose for Karrie, a family shopping app.

You receive structured product evidence only. Do not invent missing fields.

Assess the "alternative" object:
${HEALTHIER_RULES}

Return only the requested structured output.`;

export const INSTRUCTIONS = `You are a grocery product recognition assistant for Karrie, a Dutch family shopping application for parents and young children.

Analyze the provided image and identify grocery or household product(s) the parent likely intends to add.

Return structured product information in Dutch.

Read visible packaging text carefully.

Distinguish between information directly visible in the image and information inferred from context. List only the guessed fields in inferredFields; a brand or variant that is printed on the label is read, not inferred.

Never fabricate barcodes, brands, nutritional values, ingredients, package weights or exact product variants.

If a field cannot be identified reliably, return null.

Use candidates for distinct visible products or flavours (at most five). Rules:
- Two packs of the same flavour/size are one candidate (deduplicate).
- Two clearly different flavours or sizes of the same family become separate candidates; set recognitionOutcome to "multiple" and needsSelection to true.
- Prefer the central/foreground intended product over neighbouring ads. Do not list adjacent ads as candidates when one product is clearly framed.
- Do not invent flavours, brands or sizes that are not visually supported. Prefer variant null over guessing.
- For loose produce or a single clear pack, return one candidate (or only primary) with recognitionOutcome "single" and needsSelection false. Never turn clear fruit/vegetables into a multi-item chooser.
- When nothing useful is identifiable, recognitionOutcome "none", needsSelection false, primary.recognized false, candidates empty.
- When there is a weak best guess only, recognitionOutcome "uncertain", needsConfirmation true on primary.

Prefer a useful generic product category over an uncertain exact product identification.

Set catalogType only when the product is exactly that kind of product. Chocolate spread, hummus, oat drink and other products without their own catalog type get null.

Ignore unrelated background objects and promotional price text; prices are irrelevant for identity.

Do not attempt to identify people. If a face or body is visible, set containsPeople to true on primary; a hand holding the product does not count.

Do not treat a visible Nutri-Score as proof that a product is healthy.

Also assess in primary.alternative whether a comparable product of the same narrow type is meaningfully better:
${HEALTHIER_RULES}

Return only the requested structured output.`;

const MAX_TEXT = 80;
const MAX_LONG = 160;
const MAX_INGREDIENTS = 400;
const MAX_CLAIMS = 5;
const MAX_PROMPT_WORDS = 8;
const MORAL_WORDS = /\b(on)?gezond|slecht|goed|stout|vies|dik\b/i;

function clean(value: string | null, max = MAX_TEXT): string | null {
  if (value === null) return null;
  const text = value.replace(/\s+/g, " ").trim().slice(0, max);
  return text || null;
}

function childPrompt(prompt: string | null, alternativeType: string | null): string | null {
  const text = clean(prompt);
  if (text && !MORAL_WORDS.test(text) && text.split(" ").length <= MAX_PROMPT_WORDS) return text;
  return alternativeType && alternativeType.length <= 40 ? `Kun jij ${alternativeType} vinden?` : null;
}

const NO_ALTERNATIVE = { criteria: [], alternativeType: null, targetType: null, parentExplanation: null, childPrompt: null };

/** No mission without a concrete criterion, some evidence and a food product. */
export function sanitizeAlternative(alternative: Alternative, food: boolean): Alternative {
  const reason = clean(alternative.reason, MAX_LONG);
  if (!food) return { ...alternative, ...NO_ALTERNATIVE, status: "none", reason };
  if (alternative.status !== "possible") return { ...alternative, ...NO_ALTERNATIVE, reason };
  const criteria = [...new Set(alternative.criteria)];
  if (!criteria.length || !alternative.targetType) return { ...alternative, ...NO_ALTERNATIVE, status: "none", reason };
  if (alternative.evidence === "none") return { ...alternative, ...NO_ALTERNATIVE, status: "insufficient-data", reason };
  const alternativeType = clean(alternative.alternativeType);
  return {
    ...alternative,
    criteria,
    alternativeType,
    reason,
    parentExplanation: clean(alternative.parentExplanation, MAX_LONG),
    childPrompt: childPrompt(alternative.childPrompt, alternativeType),
  };
}

function sanitizeEan(value: string | null): string | null {
  const digits = value?.replace(/[\s-]/g, "") ?? "";
  return /^(\d{8}|\d{12}|\d{13})$/.test(digits) ? digits : null;
}

/** Trims model text and drops anything that cannot be a printed barcode. */
export function sanitize(product: RecognizedProduct): RecognizedProduct {
  const ean = sanitizeEan(product.ean);
  const visibleClaims = [...new Set(product.visibleClaims.map((claim) => clean(claim)).filter((claim): claim is string => Boolean(claim)))].slice(0, MAX_CLAIMS);
  const lowConfidence = product.confidence === "low" || !product.recognized;
  const food = product.recognized && product.category !== "huishouden" && !(HOUSEHOLD_TYPES as readonly string[]).includes(product.catalogType ?? "");
  return {
    ...product,
    productName: clean(product.productName),
    genericName: clean(product.genericName),
    brand: clean(product.brand),
    variant: clean(product.variant),
    packageSize: clean(product.packageSize),
    subcategory: clean(product.subcategory)?.toLowerCase() ?? null,
    ean,
    visibleClaims,
    visibleIngredients: clean(product.visibleIngredients, MAX_INGREDIENTS),
    inferredFields: [...new Set(product.inferredFields)],
    needsConfirmation: product.needsConfirmation || lowConfidence,
    alternative: sanitizeAlternative(product.alternative, food),
  };
}

/** Trims a visual candidate; EAN digits are a hint only until exact-identity validation. */
export function sanitizeCandidate(candidate: VisualCandidate, index: number): VisualCandidate {
  const id = clean(candidate.observedCandidateId, 24) || `c${index + 1}`;
  return {
    ...candidate,
    observedCandidateId: id,
    productName: clean(candidate.productName),
    genericName: clean(candidate.genericName),
    brand: clean(candidate.brand),
    variant: clean(candidate.variant),
    packageSize: clean(candidate.packageSize),
    subcategory: clean(candidate.subcategory)?.toLowerCase() ?? null,
    ean: sanitizeEan(candidate.ean),
    inferredFields: [...new Set(candidate.inferredFields)],
  };
}

function candidateKey(candidate: Pick<VisualCandidate, "brand" | "productName" | "genericName" | "variant" | "packageSize">): string {
  return [candidate.brand, candidate.productName ?? candidate.genericName, candidate.variant, candidate.packageSize]
    .map((part) => (part ?? "").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

/** Drop duplicate SKUs and empty rows; keep at most five distinct candidates. */
export function dedupeCandidates(candidates: VisualCandidate[]): VisualCandidate[] {
  const seen = new Set<string>();
  const out: VisualCandidate[] = [];
  for (const candidate of candidates) {
    if (!candidate.productName && !candidate.genericName && !candidate.brand) continue;
    const key = candidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
    if (out.length >= 5) break;
  }
  return out;
}

function nameBlob(candidate: Pick<VisualCandidate, "productName" | "genericName" | "variant">): string {
  return [candidate.productName, candidate.genericName, candidate.variant]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function alignedWithPrimary(primary: RecognizedProduct, candidate: VisualCandidate): boolean {
  const primaryBrand = (primary.brand || "").trim().toLowerCase();
  const candidateBrand = (candidate.brand || "").trim().toLowerCase();
  if (primaryBrand && candidateBrand && (primaryBrand === candidateBrand || primaryBrand.includes(candidateBrand) || candidateBrand.includes(primaryBrand))) {
    return true;
  }
  const family = (primary.catalogType || primary.genericName || "").toLowerCase();
  if (family && (candidate.catalogType === primary.catalogType || nameBlob(candidate).includes(family))) return true;
  const primaryName = (primary.productName || "").trim().toLowerCase();
  const candidateName = (candidate.productName || "").trim().toLowerCase();
  return Boolean(primaryName && candidateName && (candidateName.includes(primaryName) || primaryName.includes(candidateName)));
}

/**
 * Preserve distinct visually intended products.
 * Never merge different explicit flavours/variants/sizes, and never drop a candidate
 * merely because its brand differs from the primary. Only collapse clear loose produce
 * when every candidate is also non-specific produce of the same family.
 * Primary-aligned candidates are listed first; other brands stay selectable after them.
 */
export function filterIntendedCandidates(primary: RecognizedProduct, candidates: VisualCandidate[]): VisualCandidate[] {
  const list = candidates.slice(0, 5);
  const allLoose = list.length > 0 && list.every((candidate) => !candidate.specificProduct);
  if (primary.recognized && primary.confidence !== "low" && !primary.specificProduct && allLoose) {
    const family = (primary.catalogType || primary.genericName || primary.productName || "").toLowerCase();
    const same = list.filter((candidate) => {
      const blob = nameBlob(candidate);
      return family && (blob.includes(family) || (candidate.catalogType && candidate.catalogType === primary.catalogType));
    });
    return (same.length ? same : list).slice(0, 1);
  }
  const aligned: VisualCandidate[] = [];
  const other: VisualCandidate[] = [];
  for (const candidate of list) {
    (alignedWithPrimary(primary, candidate) ? aligned : other).push(candidate);
  }
  return [...aligned, ...other].slice(0, 5);
}

/**
 * Server-side outcome from the cleaned primary + candidates. Model values are advisory only.
 * Multiple meaningful candidates → selection; weak/empty → uncertain/none; else single.
 */
export function deriveRecognitionOutcome(
  primary: RecognizedProduct,
  candidates: VisualCandidate[],
): { recognitionOutcome: RecognitionOutcome; needsSelection: boolean; selectionReason?: string } {
  if (!primary.recognized && candidates.length === 0) {
    return { recognitionOutcome: "none", needsSelection: false, selectionReason: "no-product" };
  }
  if (candidates.length >= 2) {
    return { recognitionOutcome: "multiple", needsSelection: true, selectionReason: "distinct-candidates" };
  }
  if (!primary.recognized || primary.confidence === "low" || primary.needsConfirmation) {
    return { recognitionOutcome: "uncertain", needsSelection: false, selectionReason: "needs-check" };
  }
  return { recognitionOutcome: "single", needsSelection: false };
}

const EMPTY_ALTERNATIVE: Alternative = {
  status: "none",
  evidence: "none",
  criteria: [],
  alternativeType: null,
  targetType: null,
  reason: null,
  parentExplanation: null,
  childPrompt: null,
};

/**
 * Lift a visual candidate into the RecognizedProduct shape used by mergeDraft.
 * Never copy another product's nutrition, claims, ingredients or healthier-alternative.
 */
export function productFromCandidate(candidate: VisualCandidate): RecognizedProduct {
  return sanitize({
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
  });
}

/** Sanitize OpenAI vision payload into primary + candidates + derived outcome. */
export function sanitizeVision(vision: RecognizeVision): {
  product: RecognizedProduct;
  candidates: VisualCandidate[];
  recognitionOutcome: RecognitionOutcome;
  needsSelection: boolean;
  selectionReason?: string;
} {
  const product = sanitize(vision.primary);
  let candidates = filterIntendedCandidates(product, dedupeCandidates(vision.candidates.map(sanitizeCandidate)));
  if (candidates.length === 0 && product.recognized) {
    candidates = [
      {
        observedCandidateId: "c1",
        productName: product.productName,
        genericName: product.genericName,
        catalogType: product.catalogType,
        specificProduct: product.specificProduct,
        brand: product.brand,
        variant: product.variant,
        packageSize: product.packageSize,
        category: product.category,
        subcategory: product.subcategory,
        ean: product.ean,
        inferredFields: product.inferredFields,
        confidence: product.confidence,
      },
    ];
  }
  const derived = deriveRecognitionOutcome(product, candidates);
  return { product, candidates, ...derived };
}
