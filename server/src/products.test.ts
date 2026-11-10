import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHandler, type AppDeps, type ProductDeps } from "./app.js";
import { createCandidateStore } from "./candidates.js";
import { createIllustrator, illustrationPrompt, illustrationRequest } from "./illustration.js";
import { createLimits, type LimitConfig } from "./limits.js";
import { guardNormalized, interpretNormalized, normalizeProduct, normalizeRequest, type NormalizedProduct, type RawNormalized } from "./normalize.js";
import { customName, parseName, plainName, singularKey } from "./productName.js";

const LIMITS: LimitConfig = { perIpPerHour: 20, perIpPerDay: 50, dailyRequests: 100, dailyBudgetUsd: 1, inputUsdPerMTok: 1, cachedInputUsdPerMTok: 0.1, outputUsdPerMTok: 4 };

const WALNUTS: RawNormalized = {
  isProduct: true,
  reason: "ok",
  canonicalName: "walnoot",
  displayName: "Walnoten",
  singularName: "walnoot",
  pluralName: "walnoten",
  childFriendlyLabel: "nootjes",
  category: "pantry",
  subcategory: "Noten",
  isGeneric: true,
  closestDrawing: "none",
  confidence: "high",
};

const PRODUCT: NormalizedProduct = guardNormalized(WALNUTS, "walnoten")!;

function completed(value: unknown) {
  return { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }], usage: { input_tokens: 400, output_tokens: 80 } };
}

describe("product names", () => {
  it("refuses phrases, numbers and empty input like the app does", () => {
    expect(customName("walnoten")).toBe("Walnoten");
    for (const input of ["", "dingen voor ontbijt", "2 kilo appels", "brood met kaas", "a", "Chocomel 6", "blik chocomel"]) expect(customName(input), input).toBeNull();
  });

  it("accepts packaging and pack sizes, and gives the product without them", () => {
    expect(parseName("Chocomel blik")).toEqual({ name: "Chocomel blik", base: "Chocomel", packaging: "can" });
    expect(parseName("chocomel 1 liter")).toEqual({ name: "Chocomel 1 liter", base: "Chocomel", size: { unit: "ml", amount: 1000 } });
    expect(parseName("Chocomel 6x200ml")).toMatchObject({ packaging: "multipack", size: { unit: "ml", amount: 200, count: 6 } });
    expect(parseName("Chocomel 0% suiker")?.base).toBe("Chocomel 0% suiker");
    expect(plainName("Walnoten 200 gram")).toBeNull();
    expect(plainName("Walnoten")).toBe("Walnoten");
  });

  it("joins singular and plural", () => {
    expect(singularKey("walnoten")).toBe(singularKey("Walnoot"));
    expect(singularKey("rozijnen")).toBe("rozijn");
  });
});

describe("normalize request", () => {
  it("never stores the request and asks for a strict schema without nutrition, barcode or brand fields", () => {
    const body = normalizeRequest({ model: "gpt-5.4-mini", maxOutputTokens: 600 }, "Walnoten");
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({ type: "json_schema", name: "generic_product", strict: true });
    type Strict = { required: string[]; properties: Record<string, unknown>; additionalProperties: boolean };
    const schema = body.text.format.schema as Strict;
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(["canonicalName", "displayName", "singularName", "pluralName", "category", "subcategory", "isGeneric", "childFriendlyLabel", "confidence"]));
    expect(Object.keys(schema.properties).join(" ")).not.toMatch(/ean|barcode|brand|nutri|kcal|sugar/i);
    expect(body.input).toBe("Product: Walnoten");
  });
});

describe("guardNormalized", () => {
  it("keeps one generic product with tidy names", () => {
    expect(PRODUCT).toEqual({
      canonicalName: "walnoot",
      displayName: "Walnoten",
      singularName: "walnoot",
      pluralName: "walnoten",
      childFriendlyLabel: "nootjes",
      category: "pantry",
      subcategory: "noten",
      closestDrawing: null,
      confidence: "high",
    });
  });

  it("refuses phrases, brands, low confidence and a different product", () => {
    expect(guardNormalized({ ...WALNUTS, isProduct: false, reason: "phrase" }, "dingen voor ontbijt")).toBeNull();
    expect(guardNormalized({ ...WALNUTS, isGeneric: false, reason: "brand" }, "walnoten")).toBeNull();
    expect(guardNormalized({ ...WALNUTS, confidence: "low" }, "walnoten")).toBeNull();
    expect(guardNormalized({ ...WALNUTS, displayName: "Hazelnoten", canonicalName: "hazelnoot", singularName: "hazelnoot", pluralName: "hazelnoten" }, "walnoten")).toBeNull();
    expect(guardNormalized({ ...WALNUTS, displayName: "Walnoten 200 gram" }, "walnoten")).toBeNull();
  });

  it("accepts a small spelling fix of what was typed", () => {
    expect(guardNormalized(WALNUTS, "walnooten")).not.toBeNull();
    expect(guardNormalized({ ...WALNUTS, canonicalName: "rozijn", displayName: "Rozijnen", singularName: "rozijn", pluralName: "rozijnen" }, "rozijnen")).not.toBeNull();
  });

  it("upgrades a pantry model answer to drinks when the name is clearly a drink", () => {
    const cola: RawNormalized = {
      ...WALNUTS,
      canonicalName: "cola",
      displayName: "Cola",
      singularName: "cola",
      pluralName: "cola",
      childFriendlyLabel: "cola",
      category: "pantry",
      subcategory: null,
    };
    expect(guardNormalized(cola, "cola")).toMatchObject({ category: "drinks", displayName: "Cola" });
  });

  it("maps model answers and errors without throwing", async () => {
    expect(interpretNormalized(completed(WALNUTS), "walnoten")).toMatchObject({ ok: true, product: { displayName: "Walnoten" }, usage: { inputTokens: 400 } });
    expect(interpretNormalized(completed({ ...WALNUTS, calories: 600 }), "walnoten")).toMatchObject({ ok: false, code: "malformed" });
    expect(interpretNormalized(completed({ ...WALNUTS, isProduct: false, reason: "phrase" }), "x")).toMatchObject({ ok: false, code: "not-a-product" });
    expect(interpretNormalized({ status: "incomplete", output: [] }, "walnoten")).toMatchObject({ ok: false, code: "incomplete" });
    const failing = { responses: { create: async () => Promise.reject(new TypeError("fetch failed")) } };
    await expect(normalizeProduct(failing, { model: "m", maxOutputTokens: 10 }, "walnoten")).resolves.toEqual({ ok: false, code: "unavailable" });
  });
});

describe("candidate store", () => {
  it("keeps one pending candidate for singular and plural, counting each device once a day", () => {
    let time = Date.UTC(2026, 10, 7, 9);
    const store = createCandidateStore({ now: () => time });
    const first = store.record(PRODUCT, "walnoten", "search", "1.1.1.1")!;
    expect(first).toMatchObject({ canonicalName: "walnoot", approvalStatus: "pending", usageCount: 1, createdFrom: "search", illustration: null });
    expect(store.find("walnoot")).toBe(first);
    expect(store.find("Walnoten")).toBe(first);
    store.record(PRODUCT, "walnoot", "search", "1.1.1.1");
    store.seen(first, "1.1.1.1");
    expect(first.usageCount).toBe(1);
    store.seen(first, "2.2.2.2");
    expect(first.usageCount).toBe(2);
    time += 24 * 60 * 60 * 1000;
    store.seen(first, "1.1.1.1");
    expect(first.usageCount).toBe(3);
    expect(store.list()).toHaveLength(1);
    expect(JSON.stringify(store.list())).not.toMatch(/1\.1\.1\.1|2\.2\.2\.2/);
  });

  it("never approves on its own, and a person can approve or reject", () => {
    const store = createCandidateStore();
    const candidate = store.record(PRODUCT, "walnoten", "search", "ip")!;
    for (let index = 0; index < 50; index += 1) store.seen(candidate, `device-${index}`);
    expect(candidate.approvalStatus).toBe("pending");
    expect(store.review(candidate.candidateId, "approved")).toMatchObject({ approvalStatus: "approved", reviewedAt: expect.any(String) });
    expect(store.stats()).toMatchObject({ total: 1, pending: 0, approved: 1, persistent: false });
  });

  it("survives a restart when a file is configured", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "karrie-candidates-")), "candidates.json");
    const store = createCandidateStore({ file });
    store.record(PRODUCT, "walnoten", "photo", "ip");
    await store.flush();
    expect(JSON.parse(readFileSync(file, "utf8")).candidates[0]).toMatchObject({ canonicalName: "walnoot", createdFrom: "photo" });
    const again = createCandidateStore({ file });
    expect(again.find("walnoot")).toMatchObject({ usageCount: 1, approvalStatus: "pending" });
  });
});

describe("illustrations", () => {
  it("asks for a small transparent Karrie-style drawing, never a photo", () => {
    const candidate = createCandidateStore().record(PRODUCT, "walnoten", "search", "ip")!;
    const body = illustrationRequest({ model: "gpt-image-1", imageUsd: 0.011 }, candidate);
    expect(body).toMatchObject({ model: "gpt-image-1", n: 1, size: "1024x1024", quality: "low", background: "transparent", output_format: "webp" });
    const prompt = illustrationPrompt(candidate);
    expect(prompt).toMatch(/Walnoten/);
    expect(prompt).toMatch(/Not photo-realistic/);
    expect(prompt).toMatch(/no brand/);
  });
});

describe("product routes", () => {
  let server: Server | null = null;
  const logs: Record<string, unknown>[] = [];

  afterEach(() => {
    server?.close();
    server = null;
    logs.length = 0;
  });

  async function start(products: Partial<ProductDeps> = {}, overrides: Partial<AppDeps> = {}) {
    const deps: ProductDeps = {
      normalize: async () => ({ ok: true, product: PRODUCT, usage: { inputTokens: 400, cachedInputTokens: 0, outputTokens: 80 } }),
      candidates: createCandidateStore(),
      limits: createLimits(LIMITS),
      ...products,
    };
    const handler = createHandler({
      allowedOrigins: ["https://karrieapp.onrender.com"],
      requireOrigin: true,
      configured: true,
      model: "gpt-5.4-mini",
      limits: createLimits(LIMITS),
      recognize: async () => ({ ok: false, code: "refused" }),
      products: deps,
      log: (entry) => logs.push(entry),
      ...overrides,
    });
    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const call = (path: string, body?: unknown, headers: Record<string, string> = {}, ip = "10.0.0.1") =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", Origin: "https://karrieapp.onrender.com", "X-Forwarded-For": ip, ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    return { call, deps };
  }

  it("normalizes once, then answers other devices from the candidate without OpenAI", async () => {
    let calls = 0;
    const { call, deps } = await start({
      normalize: async () => {
        calls += 1;
        return { ok: true, product: PRODUCT };
      },
    });
    const first = await call("/api/products/normalize", { name: "walnoten" });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      status: "ok",
      illustrations: false,
      product: { canonicalName: "walnoot", displayName: "Walnoten", singularName: "walnoot", pluralName: "walnoten", childFriendlyLabel: "nootjes", category: "pantry", subcategory: "noten", closestDrawing: null },
    });
    const second = await call("/api/products/normalize", { name: "Walnoot" }, {}, "10.0.0.2");
    expect((await second.json()).product.displayName).toBe("Walnoten");
    expect(calls).toBe(1);
    expect(deps.candidates.list()[0]).toMatchObject({ usageCount: 2, approvalStatus: "pending" });
    expect(JSON.stringify(logs)).not.toMatch(/walno/i);
  });

  it("refuses phrases and brands without saving a candidate", async () => {
    let calls = 0;
    const { call, deps } = await start({
      normalize: async () => {
        calls += 1;
        return { ok: false, code: "not-a-product" };
      },
    });
    expect((await call("/api/products/normalize", { name: "dingen voor ontbijt" })).status).toBe(422);
    expect(calls).toBe(0);
    expect((await call("/api/products/normalize", { name: "Calvé" })).status).toBe(422);
    expect(calls).toBe(1);
    expect(deps.candidates.list()).toHaveLength(0);
    expect((await call("/api/products/normalize", { name: "walnoten", list: ["melk"] })).status).toBe(400);
  });

  it("keeps a brand that OpenAI recognises as a branded candidate and tells the app why", async () => {
    const { call, deps } = await start({ normalize: async () => ({ ok: false, code: "not-a-product", brand: true }) });
    const response = await call("/api/products/normalize", { name: "Optimel" });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ status: "error", code: "not-a-product", reason: "brand" });
    expect(deps.candidates.list()).toEqual([expect.objectContaining({ classification: "branded", brand: "Optimel" })]);
    expect(deps.candidates.find("optimel")).toBeNull();
  });

  it("answers a rejected candidate as not a product", async () => {
    const { call, deps } = await start();
    await call("/api/products/normalize", { name: "walnoten" });
    deps.candidates.review(deps.candidates.list()[0].candidateId, "rejected");
    expect((await call("/api/products/normalize", { name: "walnoten" })).status).toBe(422);
  });

  it("keeps the review routes hidden without the right token", async () => {
    const hidden = await start();
    expect((await hidden.call("/api/admin/candidates")).status).toBe(404);
    server?.close();

    const { call } = await start({ adminToken: "secret-token" });
    await call("/api/products/normalize", { name: "walnoten" });
    expect((await call("/api/admin/candidates", undefined, { Authorization: "Bearer wrong" })).status).toBe(404);
    const listed = await call("/api/admin/candidates?status=pending", undefined, { Authorization: "Bearer secret-token" });
    const [candidate] = (await listed.json()).candidates;
    expect(candidate).toMatchObject({ canonicalName: "walnoot", approvalStatus: "pending" });
    const reviewed = await call(`/api/admin/candidates/${candidate.candidateId}`, { approvalStatus: "approved" }, { Authorization: "Bearer secret-token" });
    expect((await reviewed.json()).candidate.approvalStatus).toBe("approved");
    expect((await call(`/api/admin/candidates/${candidate.candidateId}`, { approvalStatus: "published" }, { Authorization: "Bearer secret-token" })).status).toBe(400);
  });

  it("has no illustration route while the flag is off", async () => {
    const { call } = await start();
    expect((await call("/api/products/illustration", { name: "walnoten" })).status).toBe(404);
    const health = await (await call("/api/health")).json();
    expect(health.products.illustrations).toEqual({ enabled: false });
  });

  it("draws a known candidate once, counts its cost and serves the cached drawing after that", async () => {
    let generated = 0;
    const illustrator = createIllustrator(
      {
        images: {
          generate: async () => {
            generated += 1;
            return { data: [{ b64_json: "UklGRg==" }] };
          },
        },
      },
      { model: "gpt-image-1", imageUsd: 0.011 },
    );
    const limits = createLimits({ ...LIMITS, inputUsdPerMTok: 0, cachedInputUsdPerMTok: 0, outputUsdPerMTok: 0 });
    const { call, deps } = await start({ illustrations: { illustrator, limits } });
    expect((await call("/api/products/illustration", { name: "walnoten" })).status).toBe(404);
    const normalized = await (await call("/api/products/normalize", { name: "walnoten" })).json();
    expect(normalized.illustrations).toBe(true);
    const first = await call("/api/products/illustration", { name: "walnoten" });
    expect(await first.json()).toEqual({ status: "ok", image: "data:image/webp;base64,UklGRg==" });
    const second = await call("/api/products/illustration", { name: "walnoot" }, {}, "10.0.0.9");
    expect((await second.json()).image).toBe("data:image/webp;base64,UklGRg==");
    expect(generated).toBe(1);
    expect(limits.stats().today.costUsd).toBeCloseTo(0.011);
    expect(deps.candidates.list()[0].illustration).toMatch(/^memory:/);
    expect(JSON.stringify(logs)).not.toContain("UklGRg");
  });

  it("stops drawing at the daily budget", async () => {
    const illustrator = createIllustrator({ images: { generate: async () => ({ data: [{ b64_json: "AAAA" }] }) } }, { model: "gpt-image-1", imageUsd: 0.6 });
    const limits = createLimits({ ...LIMITS, dailyBudgetUsd: 1, inputUsdPerMTok: 0, cachedInputUsdPerMTok: 0, outputUsdPerMTok: 0 });
    const candidates = createCandidateStore();
    for (const name of ["walnoten", "komijn", "rozijnen"]) {
      const key = singularKey(name);
      candidates.record({ ...PRODUCT, canonicalName: key, displayName: customName(name)!, singularName: key, pluralName: key }, name, "search", "ip");
    }
    const { call } = await start({ candidates, illustrations: { illustrator, limits } });
    expect((await call("/api/products/illustration", { name: "walnoten" })).status).toBe(200);
    expect((await call("/api/products/illustration", { name: "komijn" })).status).toBe(200);
    const third = await call("/api/products/illustration", { name: "rozijnen" });
    expect(third.status).toBe(429);
    expect((await third.json()).code).toBe("budget");
  });
});
