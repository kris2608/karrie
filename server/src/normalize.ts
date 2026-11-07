import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { Usage } from "./limits.js";
import { customName, normalizeName, singularKey } from "./productName.js";
import { errorCode, type RecognizeErrorCode } from "./recognize.js";
import { CATALOG_TYPES } from "./schema.js";

export const DEPARTMENTS = [
  "produce",
  "bakery",
  "meat",
  "breakfast",
  "pantry",
  "dairy",
  "drinks",
  "frozen",
  "household",
] as const;

const Name = z.string().describe("Dutch, at most three words, no brand, no quantity.");

/** Only naming and a department: never nutrition, a barcode or a brand. */
export const NormalizedSchema = z.strictObject({
  isProduct: z.boolean().describe("True for one kind of thing you buy in a Dutch supermarket. False for a phrase, a meal, a list, a person or nonsense."),
  reason: z.enum(["ok", "phrase", "brand", "not-in-supermarket", "unclear"]),
  canonicalName: Name.describe("Lowercase singular base name, e.g. 'walnoot'."),
  displayName: Name.describe("How a Dutch shopping list writes it, capitalised, usually plural for things bought by the piece or bag, e.g. 'Walnoten'."),
  singularName: Name,
  pluralName: Name,
  childFriendlyLabel: Name.describe("A word a five-year-old knows for it, e.g. 'nootjes'; may equal displayName."),
  category: z
    .enum(DEPARTMENTS)
    .describe(
      "produce: groente en fruit; bakery: brood; meat: vlees, vis en vega; breakfast: ontbijt en broodbeleg; pantry: houdbaar (also nuts, spices, dried fruit); dairy: zuivel, kaas en eieren; drinks: dranken; frozen: diepvries; household: verzorging en huishouden.",
    ),
  subcategory: z.string().nullable().describe("A short Dutch shelf name such as 'noten', 'specerijen' or 'gedroogd fruit', or null."),
  isGeneric: z.boolean().describe("False when the name is a brand or a branded product."),
  closestDrawing: z
    .enum([...CATALOG_TYPES, "none"] as const)
    .describe("The Karrie catalog drawing that looks most like it, so a child recognises it on the shelf, or 'none' when nothing comes close."),
  confidence: z.enum(["high", "medium", "low"]),
});
export type RawNormalized = z.infer<typeof NormalizedSchema>;
const FORMAT = zodTextFormat(NormalizedSchema, "generic_product");

export type NormalizedProduct = {
  canonicalName: string;
  displayName: string;
  singularName: string;
  pluralName: string;
  childFriendlyLabel: string;
  category: (typeof DEPARTMENTS)[number];
  subcategory: string | null;
  closestDrawing: string | null;
  confidence: "high" | "medium";
};

export type NormalizeConfig = { model: string; maxOutputTokens: number };

export type NormalizeResult =
  | { ok: true; product: NormalizedProduct; usage?: Usage }
  | { ok: false; code: RecognizeErrorCode | "not-a-product"; usage?: Usage };

type ResponsesClient = { responses: { create: (body: never) => Promise<unknown> } };

type RawResponse = {
  status?: string;
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
};

const INSTRUCTIONS = [
  "Je ordent producten voor Karrie, een boodschappenspel voor kinderen in Nederland.",
  "Een ouder typte één product dat niet in de vaste lijst staat. Geef de algemene productsoort, nooit een merk of een specifieke verpakking.",
  "Corrigeer alleen spelling en enkelvoud of meervoud; maak er geen ander product van. Geen hoeveelheden, gewichten, voedingswaarden of streepjescodes.",
  "Is het geen enkel product (een zin, een maaltijd, een lijst, een merknaam of onzin), zet dan isProduct op false en kies de reden.",
].join("\n");

export function normalizeRequest(config: NormalizeConfig, name: string) {
  return {
    model: config.model,
    store: false,
    reasoning: { effort: "low" as const },
    instructions: INSTRUCTIONS,
    input: `Product: ${name}`,
    text: { format: { type: FORMAT.type, name: FORMAT.name, strict: true, schema: FORMAT.schema } },
    max_output_tokens: config.maxOutputTokens,
  };
}

function usageOf(response: RawResponse): Usage | undefined {
  if (!response.usage) return undefined;
  return {
    inputTokens: response.usage.input_tokens ?? 0,
    cachedInputTokens: response.usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
  };
}

const tidy = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * The model's answer, checked again: it must still be one generic product, every name must pass the same guard as
 * the app, and it must stay the product the parent typed (same word in singular or plural, or one small spelling fix).
 */
export function guardNormalized(raw: RawNormalized, typed: string): NormalizedProduct | null {
  if (!raw.isProduct || raw.reason !== "ok" || !raw.isGeneric || raw.confidence === "low") return null;
  const names = [raw.displayName, raw.singularName, raw.pluralName, raw.canonicalName].map(tidy);
  if (names.some((name) => !customName(name))) return null;
  const typedKey = singularKey(typed);
  const keys = names.map(singularKey);
  const near = keys.some((key) => key === typedKey || editDistance(key, typedKey) <= Math.max(1, Math.floor(typedKey.length / 6)));
  if (!near) return null;
  const label = tidy(raw.childFriendlyLabel);
  const subcategory = raw.subcategory ? tidy(raw.subcategory).slice(0, 30) : null;
  return {
    canonicalName: normalizeName(raw.canonicalName),
    displayName: customName(raw.displayName)!,
    singularName: normalizeName(raw.singularName),
    pluralName: normalizeName(raw.pluralName),
    childFriendlyLabel: customName(label) ? normalizeName(label) : normalizeName(raw.displayName),
    category: raw.category,
    subcategory: subcategory && customName(subcategory) ? subcategory.toLowerCase() : null,
    closestDrawing: raw.closestDrawing === "none" ? null : raw.closestDrawing,
    confidence: raw.confidence,
  };
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = i - 1;
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[right.length];
}

export function interpretNormalized(response: RawResponse, typed: string): NormalizeResult {
  const usage = usageOf(response);
  if (response.status && response.status !== "completed") return { ok: false, code: response.status === "incomplete" ? "incomplete" : "unavailable", usage };
  const parts = (response.output ?? []).filter((item) => item.type === "message").flatMap((item) => item.content ?? []);
  if (parts.some((part) => part.type === "refusal")) return { ok: false, code: "refused", usage };
  const text = parts.find((part) => part.type === "output_text")?.text;
  if (!text) return { ok: false, code: "malformed", usage };
  let parsed: ReturnType<typeof NormalizedSchema.safeParse>;
  try {
    parsed = NormalizedSchema.safeParse(JSON.parse(text));
  } catch {
    return { ok: false, code: "malformed", usage };
  }
  if (!parsed.success) return { ok: false, code: "malformed", usage };
  const product = guardNormalized(parsed.data, typed);
  return product ? { ok: true, product, usage } : { ok: false, code: "not-a-product", usage };
}

export async function normalizeProduct(client: ResponsesClient, config: NormalizeConfig, name: string): Promise<NormalizeResult> {
  try {
    const response = (await client.responses.create(normalizeRequest(config, name) as never)) as RawResponse;
    return interpretNormalized(response, name);
  } catch (error) {
    return { ok: false, code: errorCode(error) };
  }
}
