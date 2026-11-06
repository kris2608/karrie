import { z } from "zod";

export const SHOP_SECTIONS = ["groente-fruit", "bakker", "houdbaar", "koeling", "diepvries", "huishouden"] as const;
export const INFERABLE_FIELDS = ["productName", "genericName", "brand", "variant", "packageSize", "category", "subcategory"] as const;

/**
 * Strict Structured Outputs only accept a subset of JSON Schema: every field
 * is required, missing values are explicit nulls and objects are closed.
 */
export const RecognizedProductSchema = z
  .object({
    recognized: z.boolean().describe("True when one main grocery or household product is identifiable."),
    productName: z.string().nullable().describe("Product name as printed on the pack, in Dutch where printed in Dutch."),
    genericName: z.string().nullable().describe("Short generic Dutch product type, e.g. 'pindakaas', 'melk', 'appels'."),
    brand: z.string().nullable().describe("Brand exactly as printed. Null when not readable."),
    variant: z.string().nullable().describe("Flavour or variant as printed, e.g. 'naturel'. Null when not readable."),
    packageSize: z.string().nullable().describe("Weight or volume only if printed and readable, e.g. '350 g'."),
    category: z.enum(SHOP_SECTIONS).nullable().describe("Supermarket section in a Dutch store."),
    subcategory: z.string().nullable().describe("Lowercase Dutch product type used for matching, e.g. 'pindakaas'."),
    ean: z.string().nullable().describe("Barcode digits only if the barcode numbers are fully readable. Never guess."),
    visibleNutriScore: z.enum(["A", "B", "C", "D", "E"]).nullable().describe("Nutri-Score letter only if visible."),
    visibleClaims: z.array(z.string()).describe("Short claims printed on the pack, at most five."),
    inferredFields: z.array(z.enum(INFERABLE_FIELDS)).describe("Only fields whose value is NOT printed on the pack and was guessed from shape, colour or context. Leave out every field copied from visible text, such as a brand name on the label. Often empty."),
    confidence: z.enum(["high", "medium", "low"]),
    needsConfirmation: z.boolean().describe("True when a parent should check the result, always for low confidence or ambiguity."),
    containsPeople: z.boolean().describe("True when a face or body of a person is visible. A hand or fingers holding the product do not count."),
  })
  .strict();

export type RecognizedProduct = z.infer<typeof RecognizedProductSchema>;

export const INSTRUCTIONS = `You are a grocery product recognition assistant for Karrie, a Dutch family shopping application.

Analyze the provided image and identify the main grocery or household product.

Return structured product information in Dutch.

Read visible packaging text carefully.

Distinguish between information directly visible in the image and information inferred from context. List only the guessed fields in inferredFields; a brand or variant that is printed on the label is read, not inferred.

Never fabricate barcodes, brands, nutritional values, ingredients, package weights or exact product variants.

If a field cannot be identified reliably, return null.

If the image contains several products or is ambiguous, indicate that confirmation or a new photo is required.

Prefer a useful generic product category over an uncertain exact product identification.

Ignore unrelated background objects.

Do not attempt to identify people. If a face or body is visible, set containsPeople to true; a hand holding the product does not count.

Do not treat a visible Nutri-Score as proof that a product is healthy.

Return only the requested structured output.`;

const MAX_TEXT = 80;
const MAX_CLAIMS = 5;

function clean(value: string | null): string | null {
  if (value === null) return null;
  const text = value.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  return text || null;
}

/** Trims model text and drops anything that cannot be a printed barcode. */
export function sanitize(product: RecognizedProduct): RecognizedProduct {
  const digits = product.ean?.replace(/[\s-]/g, "") ?? "";
  const ean = /^(\d{8}|\d{12}|\d{13})$/.test(digits) ? digits : null;
  const visibleClaims = [...new Set(product.visibleClaims.map(clean).filter((claim): claim is string => Boolean(claim)))].slice(0, MAX_CLAIMS);
  const lowConfidence = product.confidence === "low" || !product.recognized;
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
    inferredFields: [...new Set(product.inferredFields)],
    needsConfirmation: product.needsConfirmation || lowConfidence,
  };
}
