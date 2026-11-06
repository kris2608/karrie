import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

/**
 * What a product page says about the product, for later healthier-choice missions. Every value was found on the
 * page itself; nothing here is the model's own knowledge.
 */
export type ProductFacts = {
  nutriScore?: "A" | "B" | "C" | "D" | "E";
  /** Per 100 g, or per 100 ml when unit is "ml". */
  per100?: { unit: "g" | "ml"; energyKcal?: number; fat?: number; saturatedFat?: number; sugars?: number; fibre?: number; protein?: number; salt?: number };
  ingredients?: string;
  allergens?: string[];
  claims?: string[];
  quantity?: string;
  sourceUrl: string;
  sourceName: string;
  readAt: number;
};

export const FACT_RULES = {
  evidenceChars: 12_000,
  jsonLdChars: 3_000,
  minEvidenceChars: 200,
  ingredientsChars: 600,
  listItems: 12,
  pages: 2,
};

const num = z.number().nullable();
export const FactsSchema = z.object({
  sameProduct: z
    .boolean()
    .describe("The page is about this product: same brand, kind and variant or flavour. A different pack size or a multipack of it still counts; a category or another variant does not."),
  samePack: z.boolean().describe("The page is about the same pack size as the product, not a multipack or another weight."),
  nutriScore: z.enum(["A", "B", "C", "D", "E"]).nullable(),
  per100Unit: z.enum(["g", "ml"]).nullable(),
  energyKcal: num,
  fat: num,
  saturatedFat: num,
  sugars: num,
  fibre: num,
  protein: num,
  salt: num,
  ingredients: z.string().nullable().describe("The ingredient list as written on the page."),
  allergens: z.array(z.string()),
  claims: z
    .array(z.string())
    .describe("Health, diet and quality claims or certification labels written on the page, e.g. 'zonder toegevoegde suikers', 'volkoren', 'Bio', 'Beter Leven'. Not allergens, not the Nutri-Score, not taste or marketing slogans."),
  quantity: z.string().nullable().describe("Net content as written, e.g. '350 g' or '1 L'."),
});
export type RawFacts = z.infer<typeof FactsSchema>;
const FACTS = zodTextFormat(FactsSchema, "product_facts");

export type Evidence = { text: string; nutriScores: string[] };

const decode = (value: string) =>
  value
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&euml;/g, "ë")
    .replace(/&eacute;/g, "é");

/** Product objects from JSON-LD, which shops use for name, brand, weight and sometimes nutrition. */
function jsonLd(html: string): string {
  const products: unknown[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const type = record["@type"];
    if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
      const { name, brand, description, nutrition, weight, size, keywords, category } = record;
      products.push({ name, brand, description, nutrition, weight, size, keywords, category });
    }
    if (record["@graph"]) visit(record["@graph"]);
  };
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(match[1]));
    } catch {
      // A broken block on a shop page is common and not fatal.
    }
  }
  return products.length ? JSON.stringify(products).slice(0, FACT_RULES.jsonLdChars) : "";
}

const KEYWORDS = /(voedingswaarde|ingredi[eë]nt|allergi|nutri[\s-]?score|energie|suikers|verzadigd|vezels|eiwitten|zout\b|keurmerk|kenmerken|zonder toegevoegd|volkoren|biologisch|inhoud|netto)/gi;

/** The page text a model may read: JSON-LD, the title and the passages around nutrition words. Also the Nutri-Score in image names and alt texts. */
export function pageEvidence(html: string): Evidence {
  const nutriScores = [...new Set([...html.matchAll(/nutri[\s_-]?score[\s_:-]*(?:logo[\s_-]*)?([a-e])(?![a-z])/gi)].map((match) => match[1].toUpperCase()))];
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const body = decode(
    html
      .replace(/<(script|style|noscript|svg|title)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<img[^>]*\balt=["']([^"']*)["'][^>]*>/gi, " $1 ")
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/td|\/th|\/h\d)[^>]*>/gi, " | ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ");
  const windows: [number, number][] = [];
  for (const match of body.matchAll(KEYWORDS)) {
    const start = Math.max(0, (match.index ?? 0) - 200);
    const end = Math.min(body.length, (match.index ?? 0) + 1200);
    const last = windows.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else windows.push([start, end]);
  }
  const passages = windows.map(([start, end]) => body.slice(start, end).trim()).join(" … ");
  const text = [decode(title).trim(), jsonLd(html), passages].filter(Boolean).join("\n").slice(0, FACT_RULES.evidenceChars);
  return { text, nutriScores };
}

export function worthReading(evidence: Evidence): boolean {
  return evidence.nutriScores.length > 0 || (evidence.text.length >= FACT_RULES.minEvidenceChars && /voedingswaarde|ingredi[eë]nt|nutrition/i.test(evidence.text));
}

export function factsRequest(model: string, product: string, evidence: Evidence) {
  return {
    model,
    store: false,
    reasoning: { effort: "low" as const },
    instructions: [
      "You copy product facts from a Dutch shop or brand page. Use only what the page text says; never your own knowledge.",
      "Use null or an empty list for anything the page does not state. Nutrition values are per 100 g or 100 ml, as numbers.",
      "If the page is about another product or variant, set sameProduct to false. The same product in another pack size or a multipack is still the same product; then set samePack to false.",
    ].join("\n"),
    input: `Product: ${product}\nNutri-Score images on the page: ${evidence.nutriScores.join(", ") || "none"}\n\nPage text:\n${evidence.text}`,
    text: { format: { type: FACTS.type, name: FACTS.name, strict: true, schema: FACTS.schema } },
    max_output_tokens: 700,
  };
}

const norm = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();

function numbersIn(text: string): number[] {
  return [...text.replace(/(\d),(\d)/g, "$1.$2").matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}

/** Each value must stand next to its own label ("Zout 0,1 g", "0,1 g zout", "saltContent": "0.1 g"), not anywhere on the page. */
const LABELS: Record<keyof NonNullable<ProductFacts["per100"]>, RegExp | null> = {
  unit: null,
  energyKcal: /energie|energy|calorie|kcal/gi,
  fat: /\bvet(ten)?\b|\bfat/gi,
  saturatedFat: /verzadigd|saturated/gi,
  sugars: /suiker|sugar/gi,
  fibre: /vezel|fib(er|re)/gi,
  protein: /eiwit|protein/gi,
  salt: /\bzout|\bsalt|natrium|sodium/gi,
};
const LIMITS: Partial<Record<keyof NonNullable<ProductFacts["per100"]>, number>> = { energyKcal: 900, salt: 30 };

export function nearLabel(text: string, field: keyof NonNullable<ProductFacts["per100"]>, value: number): boolean {
  const label = LABELS[field];
  if (!label || value > (LIMITS[field] ?? 100)) return false;
  for (const match of text.matchAll(label)) {
    const start = Math.max(0, (match.index ?? 0) - 25);
    if (numbersIn(text.slice(start, (match.index ?? 0) + 80)).some((found) => Math.abs(found - value) < 0.001)) return true;
  }
  return false;
}

/**
 * Drops every value the page does not contain: numbers must occur in the text, the Nutri-Score must be shown on the
 * page, and claims, allergens, ingredients and content must be written there. Returns null when nothing is left.
 */
export function guardFacts(raw: RawFacts, evidence: Evidence, source: { url: string; name: string; at: number }): ProductFacts | null {
  if (!raw.sameProduct) return null;
  const text = norm(evidence.text);
  const onPage = (field: keyof NonNullable<ProductFacts["per100"]>, value: number | null) => (value !== null && value >= 0 && nearLabel(evidence.text, field, value) ? value : undefined);
  const written = (value: string) => {
    const words = norm(value);
    return words.length > 1 && text.includes(words);
  };

  const shown = evidence.nutriScores.length === 1 ? (evidence.nutriScores[0] as ProductFacts["nutriScore"]) : undefined;
  const textual = raw.nutriScore && new RegExp(`nutri ?score ${raw.nutriScore.toLowerCase()}\\b`).test(text) ? raw.nutriScore : undefined;
  const nutriScore = raw.nutriScore && evidence.nutriScores.includes(raw.nutriScore) ? raw.nutriScore : (textual ?? shown);

  const values = {
    energyKcal: onPage("energyKcal", raw.energyKcal),
    fat: onPage("fat", raw.fat),
    saturatedFat: onPage("saturatedFat", raw.saturatedFat),
    sugars: onPage("sugars", raw.sugars),
    fibre: onPage("fibre", raw.fibre),
    protein: onPage("protein", raw.protein),
    salt: onPage("salt", raw.salt),
  };
  const present = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
  const per100 = Object.keys(present).length ? { unit: raw.per100Unit ?? "g", ...present } : undefined;

  const ingredientWords = norm(raw.ingredients ?? "").split(" ").filter((word) => word.length > 3);
  const ingredientsOk = ingredientWords.length > 0 && ingredientWords.filter((word) => text.includes(word)).length / ingredientWords.length >= 0.8;
  const ingredients = ingredientsOk ? raw.ingredients!.trim().slice(0, FACT_RULES.ingredientsChars) : undefined;

  const list = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter((value) => value && value.length <= 60 && written(value)))].slice(0, FACT_RULES.listItems);
  const allergens = list(raw.allergens);
  const allergenWords = new Set(allergens.map(norm));
  const claims = list(raw.claims).filter((claim) => !/^nutri ?score/.test(norm(claim)) && !allergenWords.has(norm(claim)) && norm(claim).length > 3);
  const quantity = raw.samePack && raw.quantity && text.replace(/ /g, "").includes(norm(raw.quantity).replace(/ /g, "")) ? raw.quantity.trim().slice(0, 20) : undefined;

  const facts: ProductFacts = {
    ...(nutriScore && { nutriScore }),
    ...(per100 && { per100 }),
    ...(ingredients && { ingredients }),
    ...(allergens.length && { allergens }),
    ...(claims.length && { claims }),
    ...(quantity && { quantity }),
    sourceUrl: source.url,
    sourceName: source.name,
    readAt: source.at,
  };
  return facts.nutriScore || facts.per100 || facts.ingredients || facts.claims || facts.allergens ? facts : null;
}

export function factsOf(response: { output?: { type: string; content?: { type: string; text?: string }[] }[] }): RawFacts | null {
  const text = (response.output ?? []).filter((item) => item.type === "message").flatMap((item) => item.content ?? []).find((part) => part.type === "output_text")?.text;
  if (!text) return null;
  try {
    const parsed = FactsSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
