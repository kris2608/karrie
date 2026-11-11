import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import OpenAI from "openai";
import { afterEach, describe, expect, it } from "vitest";
import { createHandler, type AppDeps } from "./app.js";
import { createLimits, type LimitConfig } from "./limits.js";
import { errorCode, interpret, recognizePhoto, requestBody, type RecognizeConfig } from "./recognize.js";
import { RecognizedProductSchema, sanitize, type RecognizedProduct } from "./schema.js";
import { checkImage } from "./validate.js";

const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const jpeg = (bytes = 4000) => `data:image/jpeg;base64,${Buffer.concat([JPEG_HEAD, Buffer.alloc(bytes)]).toString("base64")}`;
const png = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(4000)]).toString("base64")}`;

const PEANUT: RecognizedProduct = {
  recognized: true,
  productName: "  100% Pindakaas   Naturel ",
  genericName: "Pindakaas",
  brand: "AH Terra",
  variant: "Naturel",
  packageSize: null,
  category: "houdbaar",
  subcategory: "Pindakaas",
  ean: null,
  visibleNutriScore: "A",
  visibleClaims: ["100% pindakaas", "Naturel", "Naturel"],
  inferredFields: [],
  confidence: "high",
  needsConfirmation: false,
  containsPeople: false,
  catalogType: "pindakaas",
  specificProduct: true,
  visibleIngredients: null,
  alternative: {
    status: "none",
    evidence: "label",
    criteria: [],
    alternativeType: null,
    targetType: null,
    reason: "Al 100% pinda's.",
    parentExplanation: null,
    childPrompt: null,
  },
};

const SWEET: RecognizedProduct = {
  ...PEANUT,
  productName: "Pindakaas",
  brand: "Calvé",
  visibleIngredients: "Pinda's (90%), suiker, plantaardige olie, zout",
  alternative: {
    status: "possible",
    evidence: "label",
    criteria: ["no-added-sugar", "no-added-salt", "no-added-sugar"],
    alternativeType: "100% pindakaas",
    targetType: "pindakaas",
    reason: "Suiker en zout toegevoegd.",
    parentExplanation: "Er staan suiker en zout in de ingrediënten.",
    childPrompt: "Kun jij pindakaas met alleen pinda's vinden?",
  },
};

const CONFIG: RecognizeConfig = { model: "gpt-5.4-mini", detail: "auto", reasoningEffort: "low", maxOutputTokens: 1200 };
const LIMITS: LimitConfig = {
  perIpPerHour: 3,
  perIpPerDay: 5,
  dailyRequests: 100,
  dailyBudgetUsd: 1,
  inputUsdPerMTok: 1,
  cachedInputUsdPerMTok: 0.1,
  outputUsdPerMTok: 4,
};

function completed(text: string, usage = { input_tokens: 1000, output_tokens: 200 }) {
  return { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }], usage };
}

describe("checkImage", () => {
  it("accepts a real JPEG and PNG data URL", () => {
    expect(checkImage({ image: jpeg() })).toMatchObject({ ok: true, type: "image/jpeg" });
    expect(checkImage({ image: png })).toMatchObject({ ok: true, type: "image/png" });
  });

  it("rejects other types, fake headers, sizes and shapes", () => {
    expect(checkImage({ image: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" })).toMatchObject({ ok: false, status: 415 });
    expect(checkImage({ image: `data:image/jpeg;base64,${Buffer.alloc(4000).toString("base64")}` })).toMatchObject({ ok: false, status: 415 });
    expect(checkImage({ image: jpeg(1_600_000) })).toMatchObject({ ok: false, status: 413 });
    expect(checkImage({ image: jpeg(10) })).toMatchObject({ ok: false, status: 400 });
    expect(checkImage({ image: "https://example.com/a.jpg" })).toMatchObject({ ok: false, status: 400 });
    expect(checkImage({})).toMatchObject({ ok: false, status: 400 });
    expect(checkImage(null)).toMatchObject({ ok: false, status: 400 });
  });
});

describe("requestBody", () => {
  it("never stores the request and asks for the strict multi-candidate schema", () => {
    const body = requestBody(CONFIG, jpeg());
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({ type: "json_schema", name: "recognized_products", strict: true });
    expect(body.input[0].content[1]).toMatchObject({ type: "input_image", detail: "auto" });
    expect(JSON.stringify(body)).not.toMatch(/web_search|image_generation/);
  });

  it("produces a schema strict mode accepts: every property required, no extras", () => {
    type Strict = { required: string[]; properties: Record<string, Strict>; additionalProperties: boolean; items?: Strict };
    const schema = requestBody(CONFIG, jpeg()).text.format.schema as Strict;
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    const primary = schema.properties.primary;
    expect(primary.additionalProperties).toBe(false);
    expect([...primary.required].sort()).toEqual(Object.keys(primary.properties).sort());
    const alternative = primary.properties.alternative;
    expect(alternative.additionalProperties).toBe(false);
    expect([...alternative.required].sort()).toEqual(Object.keys(alternative.properties).sort());
    const candidates = schema.properties.candidates;
    expect(candidates.items?.additionalProperties).toBe(false);
  });

  it("passes a scanned barcode as context only, and nothing when there is none", () => {
    const withCode = requestBody(CONFIG, jpeg(), "8710400000006").input[0].content[0];
    expect(withCode.type === "input_text" && withCode.text).toMatch(/streepjescode 8710400000006.*alleen als context/s);
    const plain = requestBody(CONFIG, jpeg()).input[0].content[0];
    expect(plain.type === "input_text" && plain.text).toMatch(/Welk product staat op deze foto\?/);
  });

  it("assesses the alternative in the same call, with the same-type rules", () => {
    const body = requestBody(CONFIG, jpeg());
    expect(body.instructions).toMatch(/same narrow type/);
    expect(body.instructions).toMatch(/peanut butter -> hummus/);
    expect(body.instructions).toMatch(/always for non-food/);
    expect(body.instructions).toMatch(/candidates/);
  });
});

describe("sanitizeAlternative", () => {
  const alt = (patch: Partial<RecognizedProduct["alternative"]>, product: Partial<RecognizedProduct> = {}) =>
    sanitize({ ...SWEET, ...product, alternative: { ...SWEET.alternative, ...patch } }).alternative;

  it("keeps a real suggestion and removes duplicate criteria", () => {
    expect(alt({})).toMatchObject({ status: "possible", criteria: ["no-added-sugar", "no-added-salt"], targetType: "pindakaas" });
  });

  it("downgrades a suggestion without criteria, target or evidence", () => {
    expect(alt({ criteria: [] })).toMatchObject({ status: "none", criteria: [], childPrompt: null });
    expect(alt({ targetType: null })).toMatchObject({ status: "none" });
    expect(alt({ evidence: "none" })).toMatchObject({ status: "insufficient-data", alternativeType: null });
  });

  it("never suggests for non-food or unrecognised photos", () => {
    expect(alt({}, { category: "huishouden" }).status).toBe("none");
    expect(alt({}, { catalogType: "tandpasta" }).status).toBe("none");
    expect(alt({}, { recognized: false }).status).toBe("none");
  });

  it("replaces a moralising or long child prompt with a neutral question", () => {
    expect(alt({ childPrompt: "Kun jij gezonde pindakaas vinden?" }).childPrompt).toBe("Kun jij 100% pindakaas vinden?");
    expect(alt({ childPrompt: "Deze is slecht, zoek een betere pot" }).childPrompt).toBe("Kun jij 100% pindakaas vinden?");
    expect(alt({ childPrompt: "Kun jij een pot pindakaas vinden waar alleen pinda's in zitten?" }).childPrompt).toBe("Kun jij 100% pindakaas vinden?");
  });

  it("clears suggestion text when there is no suggestion and caps long text", () => {
    expect(alt({ status: "none" })).toMatchObject({ criteria: [], alternativeType: null, parentExplanation: null, childPrompt: null, reason: "Suiker en zout toegevoegd." });
    expect(alt({ parentExplanation: "x".repeat(400) }).parentExplanation).toHaveLength(160);
    expect(sanitize({ ...SWEET, visibleIngredients: "y".repeat(900) }).visibleIngredients).toHaveLength(400);
  });
});

describe("interpret", () => {
  it("parses and sanitizes a good answer, including legacy single-product payloads", () => {
    const result = interpret(completed(JSON.stringify(PEANUT)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.product.productName).toBe("100% Pindakaas Naturel");
    expect(result.product.subcategory).toBe("pindakaas");
    expect(result.product.visibleClaims).toEqual(["100% pindakaas", "Naturel"]);
    expect(result.product.ean).toBeNull();
    expect(result.recognitionOutcome).toBe("single");
    expect(result.needsSelection).toBe(false);
    expect(result.candidates).toHaveLength(1);
    expect(result.usage).toEqual({ inputTokens: 1000, cachedInputTokens: 0, outputTokens: 200 });
  });

  it("keeps multiple distinct flavour candidates and requires selection", () => {
    const payload = {
      recognitionOutcome: "multiple",
      needsSelection: true,
      primary: { ...PEANUT, productName: "Casa di Mama", brand: "Dr. Oetker", variant: null, needsConfirmation: true, catalogType: "pizza", category: "diepvries", subcategory: "pizza" },
      candidates: [
        {
          observedCandidateId: "c1",
          productName: "Casa di Mama Salame",
          genericName: "pizza",
          catalogType: "pizza",
          specificProduct: true,
          brand: "Dr. Oetker",
          variant: "Salame",
          packageSize: null,
          category: "diepvries",
          subcategory: "pizza",
          ean: null,
          inferredFields: [],
          confidence: "high",
        },
        {
          observedCandidateId: "c2",
          productName: "Casa di Mama Speciale",
          genericName: "pizza",
          catalogType: "pizza",
          specificProduct: true,
          brand: "Dr. Oetker",
          variant: "Speciale",
          packageSize: null,
          category: "diepvries",
          subcategory: "pizza",
          ean: null,
          inferredFields: [],
          confidence: "high",
        },
        {
          observedCandidateId: "c3",
          productName: "Blue Band",
          genericName: "margarine",
          catalogType: null,
          specificProduct: true,
          brand: "Blue Band",
          variant: null,
          packageSize: null,
          category: "koeling",
          subcategory: "margarine",
          ean: null,
          inferredFields: [],
          confidence: "medium",
        },
      ],
    };
    const result = interpret(completed(JSON.stringify(payload)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recognitionOutcome).toBe("multiple");
    expect(result.needsSelection).toBe(true);
    // Distinct flavours and a mixed-brand neighbour stay selectable; never drop for brand mismatch alone.
    expect(result.candidates.map((c) => c.variant ?? c.brand)).toEqual(["Salame", "Speciale", "Blue Band"]);
  });

  it("preserves drinkyoghurt flavours, Lay's flavours, and mixed-brand packs without merging", () => {
    const drink = interpret(
      completed(
        JSON.stringify({
          recognitionOutcome: "multiple",
          needsSelection: true,
          primary: { ...PEANUT, productName: "Milbona drinkyoghurt", brand: "Milbona", variant: null, catalogType: "yoghurt", category: "koeling", subcategory: "drinkyoghurt", packageSize: "1 l" },
          candidates: [
            {
              observedCandidateId: "c1",
              productName: "Milbona drinkyoghurt aardbei-kers",
              genericName: "drinkyoghurt",
              catalogType: "yoghurt",
              specificProduct: true,
              brand: "Milbona",
              variant: "aardbei-kers",
              packageSize: "1 l",
              category: "koeling",
              subcategory: "drinkyoghurt",
              ean: null,
              inferredFields: [],
              confidence: "high",
            },
            {
              observedCandidateId: "c2",
              productName: "Milbona drinkyoghurt mango-passievrucht",
              genericName: "drinkyoghurt",
              catalogType: "yoghurt",
              specificProduct: true,
              brand: "Milbona",
              variant: "mango-passievrucht",
              packageSize: "1 l",
              category: "koeling",
              subcategory: "drinkyoghurt",
              ean: null,
              inferredFields: [],
              confidence: "high",
            },
          ],
        }),
      ),
    );
    expect(drink.ok && drink.needsSelection).toBe(true);
    expect(drink.ok && drink.candidates.map((c) => c.variant)).toEqual(["aardbei-kers", "mango-passievrucht"]);

    const chips = interpret(
      completed(
        JSON.stringify({
          recognitionOutcome: "multiple",
          needsSelection: true,
          primary: { ...PEANUT, productName: "Lay's Flatchips", brand: "Lay's", variant: null, catalogType: "chips", category: "houdbaar", subcategory: "chips", packageSize: "200 g" },
          candidates: [
            {
              observedCandidateId: "c1",
              productName: "Lay's Flatchips Naturel",
              genericName: "chips",
              catalogType: "chips",
              specificProduct: true,
              brand: "Lay's",
              variant: "Naturel",
              packageSize: "200 g",
              category: "houdbaar",
              subcategory: "chips",
              ean: null,
              inferredFields: [],
              confidence: "high",
            },
            {
              observedCandidateId: "c2",
              productName: "Lay's Flatchips Paprika",
              genericName: "chips",
              catalogType: "chips",
              specificProduct: true,
              brand: "Lay's",
              variant: "Paprika",
              packageSize: "200 g",
              category: "houdbaar",
              subcategory: "chips",
              ean: null,
              inferredFields: [],
              confidence: "high",
            },
            {
              observedCandidateId: "c3",
              productName: "Lay's Flatchips Oven Baked",
              genericName: "chips",
              catalogType: "chips",
              specificProduct: true,
              brand: "Lay's",
              variant: "Oven Baked",
              packageSize: "150 g",
              category: "houdbaar",
              subcategory: "chips",
              ean: null,
              inferredFields: [],
              confidence: "medium",
            },
          ],
        }),
      ),
    );
    expect(chips.ok && chips.candidates.map((c) => `${c.variant}|${c.packageSize}`)).toEqual([
      "Naturel|200 g",
      "Paprika|200 g",
      "Oven Baked|150 g",
    ]);

    const mixed = interpret(
      completed(
        JSON.stringify({
          recognitionOutcome: "multiple",
          needsSelection: true,
          primary: { ...PEANUT, productName: "Milbona kaas", brand: "Milbona", catalogType: "kaas", category: "koeling", subcategory: "kaas" },
          candidates: [
            {
              observedCandidateId: "c1",
              productName: "Milbona Goudse oud",
              genericName: "kaas",
              catalogType: "kaas",
              specificProduct: true,
              brand: "Milbona",
              variant: "oud",
              packageSize: "450 g",
              category: "koeling",
              subcategory: "kaas",
              ean: null,
              inferredFields: [],
              confidence: "high",
            },
            {
              observedCandidateId: "c2",
              productName: "Beemster belegen",
              genericName: "kaas",
              catalogType: "kaas",
              specificProduct: true,
              brand: "Beemster",
              variant: "belegen",
              packageSize: "450 g",
              category: "koeling",
              subcategory: "kaas",
              ean: null,
              inferredFields: [],
              confidence: "high",
            },
          ],
        }),
      ),
    );
    expect(mixed.ok && mixed.candidates.map((c) => c.brand)).toEqual(["Milbona", "Beemster"]);
  });

  it("collapses clear loose produce to a single candidate without merging distinct flavours", () => {
    const produce = interpret(
      completed(
        JSON.stringify({
          recognitionOutcome: "multiple",
          needsSelection: true,
          primary: {
            ...PEANUT,
            productName: "Mandarijnen",
            brand: null,
            variant: null,
            packageSize: "1 kg",
            catalogType: "mandarijn",
            category: "groente-fruit",
            subcategory: "mandarijn",
            specificProduct: false,
            genericName: "mandarijnen",
          },
          candidates: [
            {
              observedCandidateId: "c1",
              productName: "Mandarijnen",
              genericName: "mandarijnen",
              catalogType: "mandarijn",
              specificProduct: false,
              brand: null,
              variant: null,
              packageSize: "1 kg",
              category: "groente-fruit",
              subcategory: "mandarijn",
              ean: null,
              inferredFields: [],
              confidence: "high",
            },
            {
              observedCandidateId: "c2",
              productName: "Wortelen",
              genericName: "wortelen",
              catalogType: "wortel",
              specificProduct: false,
              brand: null,
              variant: null,
              packageSize: null,
              category: "groente-fruit",
              subcategory: "wortel",
              ean: null,
              inferredFields: [],
              confidence: "medium",
            },
          ],
        }),
      ),
    );
    expect(produce.ok && produce.recognitionOutcome).toBe("single");
    expect(produce.ok && produce.needsSelection).toBe(false);
    expect(produce.ok && produce.candidates).toHaveLength(1);

    const syrup = interpret(
      completed(
        JSON.stringify({
          recognitionOutcome: "multiple",
          needsSelection: true,
          primary: { ...PEANUT, productName: "Cevitam Original", brand: "Cevitam", variant: "Original", catalogType: "siroop", category: "dranken", subcategory: "siroop" },
          candidates: [
            {
              observedCandidateId: "c1",
              productName: "Cevitam Original",
              genericName: "siroop",
              catalogType: "siroop",
              specificProduct: true,
              brand: "Cevitam",
              variant: "Original",
              packageSize: "600 ml",
              category: "dranken",
              subcategory: "siroop",
              ean: null,
              inferredFields: [],
              confidence: "medium",
            },
            {
              observedCandidateId: "c2",
              productName: "Cevitam Original Aardbei",
              genericName: "siroop",
              catalogType: "siroop",
              specificProduct: true,
              brand: "Cevitam",
              variant: "Aardbei",
              packageSize: "600 ml",
              category: "dranken",
              subcategory: "siroop",
              ean: null,
              inferredFields: [],
              confidence: "medium",
            },
          ],
        }),
      ),
    );
    // Explicit flavours stay distinct even when names overlap.
    expect(syrup.ok && syrup.candidates.map((c) => c.variant)).toEqual(["Original", "Aardbei"]);
    expect(syrup.ok && syrup.needsSelection).toBe(true);
  });

  it("keeps only barcode-shaped EANs and flags low confidence for confirmation", () => {
    const result = interpret(completed(JSON.stringify({ ...PEANUT, ean: "8710 400 000006", confidence: "low" })));
    expect(result.ok && result.product.ean).toBe("8710400000006");
    expect(result.ok && result.product.needsConfirmation).toBe(true);
    const bad = interpret(completed(JSON.stringify({ ...PEANUT, ean: "12345" })));
    expect(bad.ok && bad.product.ean).toBeNull();
  });

  it("maps refusals, incomplete answers and malformed content", () => {
    expect(interpret({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] })).toMatchObject({ ok: false, code: "refused" });
    expect(interpret({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] })).toMatchObject({ ok: false, code: "incomplete" });
    expect(interpret({ status: "incomplete", incomplete_details: { reason: "content_filter" }, output: [] })).toMatchObject({ ok: false, code: "refused" });
    expect(interpret({ status: "failed", output: [] })).toMatchObject({ ok: false, code: "unavailable" });
    expect(interpret(completed("{not json"))).toMatchObject({ ok: false, code: "malformed" });
    expect(interpret(completed(JSON.stringify({ ...PEANUT, confidence: "certain" })))).toMatchObject({ ok: false, code: "malformed" });
    expect(interpret({ status: "completed", output: [{ type: "reasoning" }] })).toMatchObject({ ok: false, code: "malformed" });
  });

  it("schema rejects unknown fields", () => {
    expect(RecognizedProductSchema.safeParse({ ...PEANUT, calories: 600 }).success).toBe(false);
  });
});

describe("errors", () => {
  it("maps SDK errors to small codes", () => {
    const headers = new Headers();
    expect(errorCode(new OpenAI.APIConnectionTimeoutError())).toBe("timeout");
    expect(errorCode(new OpenAI.RateLimitError(429, {}, "slow down", headers))).toBe("busy");
    expect(errorCode(new OpenAI.AuthenticationError(401, {}, "bad key", headers))).toBe("misconfigured");
    expect(errorCode(new OpenAI.BadRequestError(400, {}, "bad image", headers))).toBe("rejected");
    expect(errorCode(new OpenAI.InternalServerError(500, {}, "oops", headers))).toBe("unavailable");
    expect(errorCode(new TypeError("fetch failed"))).toBe("unavailable");
  });

  it("recognizePhoto never throws", async () => {
    const client = { responses: { create: async () => Promise.reject(new OpenAI.APIConnectionTimeoutError()) } };
    await expect(recognizePhoto(client, CONFIG, jpeg())).resolves.toEqual({ ok: false, code: "timeout" });
  });
});

describe("limits", () => {
  it("rate limits per IP per hour and resets the next hour", () => {
    let time = Date.UTC(2026, 10, 6, 9);
    const limits = createLimits(LIMITS, () => time);
    expect([1, 2, 3].map(() => limits.admit("a"))).toEqual([null, null, null]);
    expect(limits.admit("a")).toBe("rate-limited");
    expect(limits.admit("b")).toBeNull();
    time += 61 * 60 * 1000;
    expect(limits.admit("a")).toBeNull();
    expect(limits.admit("a")).toBeNull();
    expect(limits.admit("a")).toBe("rate-limited");
  });

  it("stops at the daily budget computed from real token usage", () => {
    const limits = createLimits({ ...LIMITS, dailyBudgetUsd: 0.01, perIpPerHour: 100, perIpPerDay: 100 });
    expect(limits.costOf({ inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0 })).toBeCloseTo(1);
    expect(limits.admit("a")).toBeNull();
    limits.record({ ok: true, latencyMs: 900, usage: { inputTokens: 6000, cachedInputTokens: 0, outputTokens: 1000 } });
    expect(limits.admit("a")).toBe("budget");
    expect(limits.stats().totals).toMatchObject({ ok: 1, denied: 1, inputTokens: 6000, outputTokens: 1000 });
  });
});

describe("http handler", () => {
  let server: Server | null = null;
  const logs: Record<string, unknown>[] = [];

  afterEach(() => {
    server?.close();
    server = null;
    logs.length = 0;
  });

  async function start(overrides: Partial<AppDeps> = {}) {
    const handler = createHandler({
      allowedOrigins: ["https://karrieapp.onrender.com"],
      requireOrigin: true,
      configured: true,
      model: "gpt-5.4-mini",
      limits: createLimits(LIMITS),
      recognize: async () => ({
        ok: true as const,
        product: PEANUT,
        candidates: [],
        recognitionOutcome: "single" as const,
        needsSelection: false,
        usage: { inputTokens: 900, cachedInputTokens: 0, outputTokens: 150 },
      }),
      log: (entry) => logs.push(entry),
      ...overrides,
    });
    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    return (body: unknown, headers: Record<string, string> = {}) =>
      fetch(`http://127.0.0.1:${port}/api/products/recognize-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://karrieapp.onrender.com", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });
  }

  it("recognizes a valid photo for an allowed origin without logging the image", async () => {
    const post = await start();
    const image = jpeg();
    const response = await post({ image });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://karrieapp.onrender.com");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).product.brand).toBe("AH Terra");
    const logged = JSON.stringify(logs);
    expect(logged).not.toContain(image.slice(30, 80));
    expect(logged).not.toContain("base64");
    expect(logs[0]).toMatchObject({ status: 200, usage: { inputTokens: 900 } });
  });

  it("rejects foreign origins, wrong types, oversized bodies and bad JSON", async () => {
    const post = await start();
    expect((await post({ image: jpeg() }, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ image: jpeg() }, { "Content-Type": "text/plain" })).status).toBe(415);
    expect((await post({ image: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" })).status).toBe(415);
    expect((await post("x".repeat(2 * 1024 * 1024 + 10))).status).toBe(413);
    expect((await post("{oops")).status).toBe(400);
  });

  it("blocks a second request from the same device while one is running", async () => {
    let release: () => void = () => {};
    const post = await start({
      recognize: () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ok: true,
              product: PEANUT,
              candidates: [],
              recognitionOutcome: "single",
              needsSelection: false,
            });
        }),
    });
    const first = post({ image: jpeg() });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await post({ image: jpeg() });
    expect(second.status).toBe(429);
    expect((await second.json()).code).toBe("in-flight");
    release();
    expect((await first).status).toBe(200);
  });

  it("reports model errors with a code and no product", async () => {
    const post = await start({ recognize: async () => ({ ok: false, code: "refused" }) });
    const response = await post({ image: jpeg() });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ status: "error", code: "refused" });
  });

  it("answers 503 when no key is configured", async () => {
    const post = await start({ configured: false });
    expect((await post({ image: jpeg() })).status).toBe(503);
  });
});
