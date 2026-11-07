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
  "sperziebonen", "prei", "verse-spinazie",
  "brood", "volkorenbrood", "bolletjes", "croissant", "stokbrood",
  "kipfilet", "gehakt", "zalm", "vegaburger",
  "beschuit", "crackers", "havermout", "pindakaas", "jam", "hagelslag", "muesli", "honing", "appelstroop",
  "pasta", "rijst", "tomatenpuree", "soep", "olijfolie", "bloem", "suiker", "koekjes", "chips", "pastasaus", "mais",
  "augurk", "olijven", "walnoten", "babyvoeding",
  "melk", "yoghurt", "kwark", "kaas", "mozzarella", "feta", "boter", "eieren", "slagroom", "vla", "karnemelk", "roomkaas",
  "koffie", "thee", "sinaasappelsap", "water", "drinkpakje", "frisdrank", "siroop",
  "doperwten", "ijs", "pizza", "vissticks", "spinazie", "bessen", "wokgroenten", "pastagroenten", "kant-en-klaar",
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

export const INSTRUCTIONS = `You are a grocery product recognition assistant for Karrie, a Dutch family shopping application for parents and young children.

Analyze the provided image and identify the main grocery or household product.

Return structured product information in Dutch.

Read visible packaging text carefully.

Distinguish between information directly visible in the image and information inferred from context. List only the guessed fields in inferredFields; a brand or variant that is printed on the label is read, not inferred.

Never fabricate barcodes, brands, nutritional values, ingredients, package weights or exact product variants.

If a field cannot be identified reliably, return null.

If the image contains several products or is ambiguous, indicate that confirmation or a new photo is required.

Prefer a useful generic product category over an uncertain exact product identification.

Set catalogType only when the product is exactly that kind of product. Chocolate spread, hummus, oat drink and other products without their own catalog type get null.

Ignore unrelated background objects.

Do not attempt to identify people. If a face or body is visible, set containsPeople to true; a hand holding the product does not count.

Do not treat a visible Nutri-Score as proof that a product is healthy.

Also assess in "alternative" whether a comparable product of the same narrow type is meaningfully better:
- The alternative must serve the same shopping purpose and keep the product type and its use. Examples: regular peanut butter -> 100% peanut butter without added sugar or salt; white bread -> wholegrain bread; sweetened yoghurt -> comparable yoghurt without added sugar; sugary cereal -> similar cereal with less sugar and more fibre; salted nuts -> unsalted nuts.
- Never suggest a different food: not peanut butter -> hummus, biscuits -> carrots, chocolate spread -> apples, milk -> water. A different flavour, dairy-free or reduced-fat version is not automatically better.
- Return status "none" when the product is already a strong choice in its category (for example peanut butter of 100% peanuts), when the gain is marginal or depends on context, when allergens or diet suitability are uncertain, when evidence is contradictory, and always for non-food.
- Return "insufficient-data" when the photo does not give enough evidence. Do not force a suggestion; no suggestion is a normal, good outcome.
- Use ingredients, added sugar, salt, fibre, wholegrain status and saturated fat. Never compare on calories alone. Nutri-Score is only supplementary.
- Set evidence "label" only when the reason is readable on this photo; otherwise "inferred", and then use qualified wording such as "waarschijnlijk".
- Do not mention numbers unless they are printed and readable. Do not call food good, bad, healthy or unhealthy in the child prompt.

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

/** Trims model text and drops anything that cannot be a printed barcode. */
export function sanitize(product: RecognizedProduct): RecognizedProduct {
  const digits = product.ean?.replace(/[\s-]/g, "") ?? "";
  const ean = /^(\d{8}|\d{12}|\d{13})$/.test(digits) ? digits : null;
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
