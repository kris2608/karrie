import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createHandler } from "./app.js";
import { BARCODE_RULES, checkWebPage, createBarcodeLookup, fromOff, webSearchRequest, type OffProduct } from "./barcode.js";
import { canonicalEan, eanForms } from "./ean.js";
import { createLimits } from "./limits.js";

const CALVE = "8710400000006";
const OTHER = "8712345678906";

const OFF_CALVE: OffProduct = {
  code: CALVE,
  product_name_nl: "Pindakaas",
  brands: "Calvé,Unilever",
  quantity: "350 g",
  image_front_url: "https://images.openfoodfacts.org/images/products/871/040/000/0006/front_nl.4.400.jpg",
  categories_tags: ["en:spreads", "en:peanut-butters"],
  nutriscore_grade: "c",
  nutriments: { "energy-kcal_100g": 641, sugars_100g: 6.5, salt_100g: "0.9", fat_100g: 1200 },
};

const SHOP_HTML = `<html><head><title>Jumbo Pindakaas Naturel 350 g</title></head><body>
<h1>Jumbo Pindakaas Naturel</h1><p>Inhoud: 350 g</p><table><tr><td>EAN</td><td>8712 3456 7890 6</td></tr></table></body></html>`;

function offResponse(product: OffProduct | null, status = 200, headers: Record<string, string> = {}) {
  if (status !== 200) return new Response("{}", { status, headers });
  return new Response(JSON.stringify(product ? { status: "success", product } : { status: "failure" }), { status: 200, headers: { "content-type": "application/json" } });
}

function webResponse(answer: Record<string, unknown>, urls: string[] = ["https://www.jumbo.com/producten/pindakaas-123"]) {
  return {
    output: [
      { type: "web_search_call", action: { type: "search", query: `"${OTHER}"` }, results: urls.map((url) => ({ url, title: "Pindakaas" })) },
      { type: "message", content: [{ type: "output_text", text: JSON.stringify({ found: true, name: null, brand: null, variant: null, quantity: null, sourceUrl: null, ...answer }) }] },
    ],
    usage: { input_tokens: 5000, output_tokens: 80 },
  };
}

function setup(options: { off?: (url: string) => Response; page?: string; web?: unknown } = {}) {
  let time = 1_000_000;
  const slept: number[] = [];
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const webCalls: unknown[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    if (url.startsWith(BARCODE_RULES.offOrigin)) return options.off ? options.off(url) : offResponse(null, 404);
    return new Response(options.page ?? "", { status: options.page ? 200 : 404, headers: { "content-type": "text/html" } });
  };
  const client = {
    responses: {
      create: async (body: never) => {
        webCalls.push(body);
        return options.web ?? webResponse({ found: false });
      },
    },
  };
  const lookup = createBarcodeLookup(
    { userAgent: "Karrie/1.0 (https://karrieapp.onrender.com)", web: { client, model: "m" } },
    fetchImpl,
    () => time,
    async (ms) => {
      slept.push(ms);
      time += ms;
    },
  );
  return { lookup, calls, webCalls, slept, advance: (ms: number) => (time += ms) };
}

describe("barcodes on the server", () => {
  it("accepts only checksum-valid EAN-13, EAN-8 and UPC-A, in Open Food Facts form", () => {
    expect(canonicalEan(CALVE)).toBe(CALVE);
    expect(canonicalEan("8710400000007")).toBeNull();
    expect(canonicalEan("036000291452")).toBe("0036000291452");
    expect(canonicalEan("96385074")).toBe("96385074");
    expect(canonicalEan("8710 400000006")).toBeNull();
    expect(canonicalEan(8710400000006)).toBeNull();
    expect(eanForms("0036000291452")).toEqual(["0036000291452", "036000291452"]);
  });
});

describe("Open Food Facts records", () => {
  it("is exact with a name and a brand, keeps only Open Food Facts pictures and plausible values", () => {
    expect(fromOff(CALVE, OFF_CALVE)).toEqual({
      status: "off-exact",
      product: {
        name: "Pindakaas",
        brand: "Calvé",
        quantity: "350 g",
        imageUrl: OFF_CALVE.image_front_url,
        categories: ["en:spreads", "en:peanut-butters"],
        nutriScore: "C",
        per100: { energyKcal: 641, sugars: 6.5, salt: 0.9 },
      },
    });
    expect(fromOff(CALVE, { ...OFF_CALVE, image_front_url: "https://evil.example/x.jpg" })?.product.imageUrl).toBeUndefined();
    expect(fromOff(CALVE, { ...OFF_CALVE, quantity: "350 g e" })?.product.quantity).toBe("350 g");
    expect(fromOff(CALVE, { ...OFF_CALVE, quantity: "350 g ℮" })?.product.quantity).toBe("350 g");
    expect(fromOff(CALVE, { ...OFF_CALVE, ingredients_text: "Cacahuètes, sel" })?.product.ingredients).toBeUndefined();
    expect(fromOff(CALVE, { ...OFF_CALVE, ingredients_text_nl: "Pinda's, zout" })?.product.ingredients).toBe("Pinda's, zout");
  });

  it("is partial without a brand, and nothing for placeholders, empty records or another code", () => {
    expect(fromOff(CALVE, { product_name: "Pindakaas" })?.status).toBe("off-partial");
    expect(fromOff(CALVE, { image_front_url: OFF_CALVE.image_front_url })?.status).toBe("off-partial");
    expect(fromOff(CALVE, { product_name: "Unknown", brands: "Calvé" })).toBeNull();
    expect(fromOff(CALVE, { product_name: "?", brands: "" })).toBeNull();
    expect(fromOff(CALVE, {})).toBeNull();
    expect(fromOff(CALVE, { ...OFF_CALVE, code: OTHER })).toBeNull();
  });
});

describe("web page check", () => {
  const answer = { found: true, name: "Pindakaas Naturel", brand: "Jumbo", variant: "Extra crunchy", quantity: "350 g", sourceUrl: null };

  it("needs the barcode and the name on the page and drops details the page does not show", () => {
    expect(checkWebPage(OTHER, SHOP_HTML, answer)).toEqual({ name: "Pindakaas Naturel", brand: "Jumbo", quantity: "350 g" });
    expect(checkWebPage(CALVE, SHOP_HTML, answer)).toBeNull();
    expect(checkWebPage(OTHER, SHOP_HTML, { ...answer, name: "Hagelslag melk" })).toBeNull();
    expect(checkWebPage(OTHER, SHOP_HTML.replace("8712 3456 7890 6", "87123456789061"), answer)).toBeNull();
  });

  it("asks for one stored-nothing web search with a strict schema", () => {
    const body = webSearchRequest("m", OTHER);
    expect(body.store).toBe(false);
    expect(body.max_tool_calls).toBe(1);
    expect(body.input).toContain(OTHER);
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
  });
});

describe("barcode lookup", () => {
  it("asks Open Food Facts once with a User-Agent and answers again from the cache", async () => {
    const { lookup, calls, webCalls } = setup({ off: () => offResponse(OFF_CALVE) });
    const first = await lookup.lookup(CALVE, { allowWeb: true });
    expect(first).toMatchObject({ ok: true, cached: false, answer: { status: "off-exact", source: { kind: "off", dataLicense: "ODbL", imageLicense: "CC BY-SA" } } });
    expect(calls[0].url).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v3\/product\/8710400000006\?fields=/);
    expect(calls[0].headers["User-Agent"]).toBe("Karrie/1.0 (https://karrieapp.onrender.com)");
    expect(await lookup.lookup(CALVE, { allowWeb: true })).toMatchObject({ ok: true, cached: true });
    expect(calls).toHaveLength(1);
    expect(webCalls).toHaveLength(0);
  });

  it("runs one request for the same code at a time and spaces requests to Open Food Facts", async () => {
    const { lookup, calls, slept } = setup({ off: () => offResponse(OFF_CALVE) });
    const [a, b] = await Promise.all([lookup.lookup(CALVE, { allowWeb: true }), lookup.lookup(CALVE, { allowWeb: true })]);
    expect(a).toBe(b);
    expect(calls).toHaveLength(1);
    await lookup.lookup(OTHER, { allowWeb: false });
    expect(slept).toContain(BARCODE_RULES.offGapMs);
  });

  it("retries a 429 after Retry-After, and backs off for a while when Open Food Facts stays down", async () => {
    let answers = [offResponse(null, 429, { "retry-after": "2" }), offResponse(OFF_CALVE)];
    const busy = setup({ off: () => answers.shift()! });
    expect(await busy.lookup.lookup(CALVE, { allowWeb: true })).toMatchObject({ ok: true, answer: { status: "off-exact" } });
    expect(busy.slept).toContain(2000);

    answers = [];
    const down = setup({ off: () => offResponse(null, 503) });
    expect(await down.lookup.lookup(CALVE, { allowWeb: true })).toMatchObject({ ok: false, failures: ["off:http-503"] });
    expect(down.calls).toHaveLength(3);
    expect(await down.lookup.lookup(CALVE, { allowWeb: true })).toMatchObject({ ok: false });
    expect(down.calls).toHaveLength(3);
    down.advance(BARCODE_RULES.errorTtlMs + 1);
    await down.lookup.lookup(CALVE, { allowWeb: true });
    expect(down.calls).toHaveLength(6);
  });

  it("searches the web when Open Food Facts has nothing, and keeps the answer only if the page prints the code", async () => {
    const found = setup({ page: SHOP_HTML, web: webResponse({ name: "Pindakaas Naturel", brand: "Jumbo", quantity: "350 g", sourceUrl: "https://www.jumbo.com/producten/pindakaas-123" }) });
    const result = await found.lookup.lookup(OTHER, { allowWeb: true });
    expect(result).toMatchObject({
      ok: true,
      searchCalls: 1,
      answer: { status: "web-page", product: { name: "Pindakaas Naturel", brand: "Jumbo", quantity: "350 g" }, source: { kind: "web", name: "jumbo.com" } },
      failures: ["off:not-found"],
    });
    expect(result.ok && result.usage?.inputTokens).toBe(5000);

    const elsewhere = setup({ page: SHOP_HTML.replace("8712 3456 7890 6", ""), web: webResponse({ name: "Pindakaas Naturel", brand: "Jumbo" }) });
    expect(await elsewhere.lookup.lookup(OTHER, { allowWeb: true })).toMatchObject({ ok: true, answer: { status: "none" }, failures: ["off:not-found", "web:not-on-page"] });
    expect(await elsewhere.lookup.lookup(OTHER, { allowWeb: true })).toMatchObject({ cached: true, answer: { status: "none" } });
    expect(elsewhere.webCalls).toHaveLength(1);
  });

  it("never follows a page the search did not return", async () => {
    const { lookup, calls } = setup({ page: SHOP_HTML, web: webResponse({ name: "Pindakaas Naturel", sourceUrl: "https://made-up.example/p" }, []) });
    expect(await lookup.lookup(OTHER, { allowWeb: true })).toMatchObject({ answer: { status: "none" } });
    expect(calls.some((call) => call.url.includes("made-up.example"))).toBe(false);
  });

  it("skips the web search when the budget is spent, and only briefly remembers that miss", async () => {
    const { lookup, webCalls, calls, advance } = setup();
    expect(await lookup.lookup(OTHER, { allowWeb: false })).toMatchObject({ ok: true, answer: { status: "none" }, failures: ["off:not-found", "web:budget"] });
    expect(webCalls).toHaveLength(0);
    advance(BARCODE_RULES.errorTtlMs + 1);
    await lookup.lookup(OTHER, { allowWeb: true });
    expect(webCalls).toHaveLength(1);
    expect(calls.filter((call) => call.url.startsWith(BARCODE_RULES.offOrigin))).toHaveLength(2);
  });
});

describe("POST /api/products/barcode", () => {
  let server: Server | null = null;
  const logs: Record<string, unknown>[] = [];

  afterEach(() => {
    server?.close();
    server = null;
    logs.length = 0;
  });

  async function start(budget = 1) {
    const limits = createLimits({ perIpPerHour: 2, perIpPerDay: 5, dailyRequests: 10, dailyBudgetUsd: budget, inputUsdPerMTok: 1, cachedInputUsdPerMTok: 0.1, outputUsdPerMTok: 4 });
    const { lookup, webCalls } = setup({ off: (url) => (url.includes(CALVE) ? offResponse(OFF_CALVE) : offResponse(null, 404)) });
    const handler = createHandler({
      allowedOrigins: ["https://karrieapp.onrender.com"],
      requireOrigin: true,
      configured: false,
      model: "m",
      limits: createLimits({ perIpPerHour: 1, perIpPerDay: 1, dailyRequests: 1, dailyBudgetUsd: 1, inputUsdPerMTok: 1, cachedInputUsdPerMTok: 0.1, outputUsdPerMTok: 4 }),
      recognize: async () => ({ ok: false, code: "unavailable" }),
      barcode: { lookup, limits, searchCallUsd: 0.01 },
      log: (entry) => logs.push(entry),
    });
    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    return {
      limits,
      webCalls,
      health: async () => (await fetch(`${base}/api/health`)).json(),
      post: (body: unknown) =>
        fetch(`${base}/api/products/barcode`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://karrieapp.onrender.com" }, body: JSON.stringify(body) }),
    };
  }

  it("answers from Open Food Facts without an OpenAI key, from the cache for free, and shows outcomes on health", async () => {
    const { post, limits, health } = await start();
    const response = await post({ ean: CALVE });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", answer: { ean: CALVE, status: "off-exact", product: { brand: "Calvé" } } });
    for (let i = 0; i < 3; i += 1) expect((await post({ ean: CALVE })).status).toBe(200);
    expect(limits.stats().today.requests).toBe(1);
    expect((await health()).barcode).toMatchObject({ webSearch: true, outcomes: { "off-exact": 1 } });
    expect(JSON.stringify(logs)).not.toContain(CALVE);
  });

  it("rejects invalid codes and extra fields, and rate limits new lookups", async () => {
    const { post } = await start();
    expect((await post({ ean: "8710400000007" })).status).toBe(400);
    expect((await post({ ean: CALVE, name: "x" })).status).toBe(400);
    expect((await post({ ean: "96385074" })).status).toBe(200);
    expect((await post({ ean: "036000291452" })).status).toBe(200);
    expect((await post({ ean: OTHER })).status).toBe(429);
  });

  it("still asks Open Food Facts when the web search budget is spent, but does not search the web", async () => {
    const { post, webCalls } = await start(0);
    expect(await (await post({ ean: OTHER })).json()).toMatchObject({ status: "ok", answer: { status: "none" } });
    expect(webCalls).toHaveLength(0);
  });
});
