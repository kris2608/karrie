import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createHandler } from "../app.js";
import { createLimits } from "../limits.js";
import { createOfferLookup, nameQuery } from "./index.js";
import type { OfferProduct } from "./match.js";
import { createPrijsProfeet, imageSearchUrl, parseSearch, retailerImage, searchUrl, type OfferRow, type SearchResult } from "./prijsprofeet.js";

const NOW = Date.parse("2026-11-07T10:00:00Z");
const HOUR = 60 * 60_000;

const ARLA_RAW = {
  product_id: "ah_wi168925_2026-11-02",
  name: "Arla Biologisch halfvolle melk",
  brand: "Arla",
  ean: "8718166011021",
  unified_category: "zuivel-eieren",
  quantity: "1 l",
  price: 1.5,
  original_price: 1.79,
  retailer: "albert_heijn",
  promotion_status: "active",
  promotion_type: "multi_buy",
  multi_buy_quantity: 2,
  multi_buy_price: 2.99,
  valid_until: "2026-11-08",
};

const ARLA: OfferRow = {
  retailer: "albert_heijn",
  sourceProductId: "ah_wi168925_2026-11-02",
  productName: "Arla Biologisch halfvolle melk",
  brand: "Arla",
  ean: "8718166011021",
  category: "zuivel-eieren",
  quantity: "1 l",
  promotionStatus: "active",
  promotionalPrice: 1.5,
  originalPrice: 1.79,
  promotionMechanism: "multi_buy",
  multiBuyQuantity: 2,
  multiBuyPrice: 2.99,
  validUntil: "2026-11-08",
};

const arla: OfferProduct = { name: "Biologisch halfvolle melk", brand: "Arla", size: "1 l", category: "dairy", generic: false };
const melk: OfferProduct = { name: "Melk", aliases: ["halfvolle melk"], category: "dairy", generic: true };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

describe("PrijsProfeet adapter", () => {
  it("only calls the free search for active promotions, with a User-Agent and no key by default", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const provider = createPrijsProfeet({ userAgent: "Karrie/1.0 (+https://karrieapp.onrender.com)" }, async (url, init) => {
      calls.push({ url, headers: init?.headers as Record<string, string> });
      return json({ results: [ARLA_RAW] });
    });
    const result = await provider.search("melk", "albert_heijn");
    expect(result).toMatchObject({ ok: true, rows: [{ productName: "Arla Biologisch halfvolle melk" }] });
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe("https://www.prijsprofeet.nl/api/v1/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "melk", retailer: "albert_heijn", promotion_status: "active", page_size: "20" });
    expect(calls[0].headers["User-Agent"]).toBe("Karrie/1.0 (+https://karrieapp.onrender.com)");
    expect(calls[0].headers).not.toHaveProperty("X-API-Key");
    expect(searchUrl("x", "lidl")).not.toMatch(/match|price|history/);
  });

  it("sends the free key only when one is configured", async () => {
    let headers: Record<string, string> = {};
    const provider = createPrijsProfeet({ userAgent: "Karrie", apiKey: "pp-test" }, async (_url, init) => {
      headers = init?.headers as Record<string, string>;
      return json({ results: [] });
    });
    await provider.search("melk", "jumbo");
    expect(headers["X-API-Key"]).toBe("pp-test");
  });

  it("pauses for Retry-After after a 429 without calling again", async () => {
    let now = NOW;
    let calls = 0;
    const provider = createPrijsProfeet(
      { userAgent: "Karrie" },
      async () => {
        calls += 1;
        return calls === 1 ? json({ detail: "slow down" }, 429, { "Retry-After": "30" }) : json({ results: [] });
      },
      () => now,
    );
    expect(await provider.search("melk", "jumbo")).toEqual({ ok: false, code: "limit" });
    now += 10_000;
    expect(await provider.search("melk", "jumbo")).toEqual({ ok: false, code: "limit" });
    expect(calls).toBe(1);
    now += 21_000;
    expect(await provider.search("melk", "jumbo")).toMatchObject({ ok: true });
    expect(calls).toBe(2);
  });

  it("keeps a per-minute ceiling for the whole server", async () => {
    let calls = 0;
    const provider = createPrijsProfeet({ userAgent: "Karrie", perMinute: 2 }, async () => (calls++, json({ results: [] })), () => NOW);
    await provider.search("a", "jumbo");
    await provider.search("b", "jumbo");
    expect(await provider.search("c", "jumbo")).toEqual({ ok: false, code: "limit" });
    expect(calls).toBe(2);
  });

  it("stops bare-EAN searches at the daily ceiling, so names can still be searched", async () => {
    const provider = createPrijsProfeet({ userAgent: "Karrie", eanPerDay: 1 }, async () => json({ results: [] }), () => NOW);
    expect(await provider.search("8718166011021", "albert_heijn")).toMatchObject({ ok: true });
    expect(await provider.search("8718166011021", "albert_heijn")).toEqual({ ok: false, code: "ean-limit" });
    expect(await provider.search("melk", "albert_heijn")).toMatchObject({ ok: true });
    expect(provider.stats().eanToday).toBe(1);
  });

  it("keeps only retailer photo links from the retailer's own image host", () => {
    const row = (retailer: string, image_url: unknown) => parseSearch({ results: [{ ...ARLA_RAW, retailer, image_url }] })?.[0]?.imageUrl;
    const ah = "https://static.ah.nl/dam/product/AHI_43545231?revLabel=1&rendition=800x800_WEBP&fileType=binary";
    expect(row("albert_heijn", ah)).toBe(ah);
    expect(row("jumbo", "https://www.jumbo.com/dam-images/fit-in/360x360/Products/8713788124340_H1N1.png")).toMatch(/^https:\/\/www\.jumbo\.com\/dam-images\//);
    expect(row("lidl", "https://www.lidl.nl/assets/gcp2145aa892ba745debbdc4d907952461a.png")).toMatch(/^https:\/\/www\.lidl\.nl\/assets\//);
    expect(row("albert_heijn", "http://static.ah.nl/dam/product/x")).toBeUndefined();
    expect(row("albert_heijn", "https://www.jumbo.com/dam-images/x.png")).toBeUndefined();
    expect(row("jumbo", "https://www.jumbo.com/elders/x.png")).toBeUndefined();
    expect(row("albert_heijn", "https://static.ah.nl.evil.example/dam/product/x")).toBeUndefined();
    expect(row("albert_heijn", "https://user:pw@static.ah.nl/dam/product/x")).toBeUndefined();
    expect(row("albert_heijn", 42)).toBeUndefined();
    expect(retailerImage("lidl", "javascript:alert(1)")).toBeUndefined();
  });

  it("asks for photos by barcode across all supported retailers and every promotion status, sharing the limits", async () => {
    const urls: string[] = [];
    const provider = createPrijsProfeet({ userAgent: "Karrie", eanPerDay: 2, perMinute: 3 }, async (url) => (urls.push(url), json({ results: [] })), () => NOW);
    expect(await provider.searchImage("8718166011021")).toMatchObject({ ok: true });
    const params = Object.fromEntries(new URL(urls[0]).searchParams);
    expect(params).toEqual({ q: "8718166011021", retailer: "jumbo,albert_heijn,lidl", page_size: "20" });
    expect(imageSearchUrl("8718166011021")).not.toContain("promotion_status");
    expect(searchUrl("8718166011021", "jumbo")).toContain("promotion_status=active");
    await provider.search("8718166011021", "jumbo");
    expect(await provider.searchImage("8718166011021")).toEqual({ ok: false, code: "ean-limit" });
    expect(provider.stats().eanToday).toBe(2);
    await provider.search("melk", "jumbo");
    expect(await provider.search("kaas", "jumbo")).toEqual({ ok: false, code: "limit" });
  });

  it("12. reports failures instead of throwing", async () => {
    const down = createPrijsProfeet({ userAgent: "Karrie" }, async () => {
      throw new Error("network");
    });
    const broken = createPrijsProfeet({ userAgent: "Karrie" }, async () => json({ error: true }, 500));
    const odd = createPrijsProfeet({ userAgent: "Karrie" }, async () => json({ total: 1 }));
    expect(await down.search("melk", "jumbo")).toEqual({ ok: false, code: "unavailable" });
    expect(await broken.search("melk", "jumbo")).toEqual({ ok: false, code: "unavailable" });
    expect(await odd.search("melk", "jumbo")).toEqual({ ok: false, code: "unavailable" });
  });
});

describe("offer lookup", () => {
  function fake(answer: (q: string) => SearchResult | Promise<SearchResult>) {
    const calls: string[] = [];
    return { calls, search: async (q: string, retailer: string) => (calls.push(`${retailer}|${q}`), answer(q)) };
  }

  it("asks with the brand once and leaves generic names alone", () => {
    expect(nameQuery(arla)).toBe("Arla Biologisch halfvolle melk");
    expect(nameQuery({ ...arla, name: "Arla Biologisch halfvolle melk" })).toBe("Arla Biologisch halfvolle melk");
    expect(nameQuery(melk)).toBe("Melk");
  });

  it("5. caches per supermarket and query, and shares one call for identical questions", async () => {
    const provider = fake(() => ({ ok: true, rows: [ARLA] }));
    const lookup = createOfferLookup(provider, () => NOW);
    const [first, second] = await Promise.all([lookup.find(arla, "albert_heijn"), lookup.find(arla, "albert_heijn")]);
    expect(first).toMatchObject({ ok: true, match: { matchType: "likely", matchConfidence: "high" } });
    expect(second).toEqual(first);
    await lookup.find(arla, "albert_heijn");
    expect(provider.calls).toEqual(["albert_heijn|Arla Biologisch halfvolle melk"]);
    await lookup.find(arla, "jumbo");
    expect(provider.calls).toHaveLength(2);
  });

  it("keeps search results at most three hours and never past the promotion's end", async () => {
    let now = NOW;
    const provider = fake(() => ({ ok: true, rows: [ARLA] }));
    const lookup = createOfferLookup(provider, () => now);
    await lookup.find(arla, "albert_heijn");
    now += 2 * HOUR;
    await lookup.find(arla, "albert_heijn");
    expect(provider.calls).toHaveLength(1);
    now += 2 * HOUR;
    await lookup.find(arla, "albert_heijn");
    expect(provider.calls).toHaveLength(2);

    const ending = fake(() => ({ ok: true, rows: [{ ...ARLA, validUntil: "2026-11-07" }] }));
    let late = Date.parse("2026-11-07T21:00:00Z");
    const short = createOfferLookup(ending, () => late);
    await short.find(arla, "albert_heijn");
    late = Date.parse("2026-11-07T23:30:00Z");
    expect(await short.find(arla, "albert_heijn")).toMatchObject({ ok: true, match: { matchType: "none" } });
    expect(ending.calls).toHaveLength(2);
  });

  it("2. searches by EAN first and stops there when it is exact", async () => {
    const provider = fake((q) => ({ ok: true, rows: q === "8718166011021" ? [ARLA] : [] }));
    const lookup = createOfferLookup(provider, () => NOW);
    expect(await lookup.find({ ...arla, ean: "8718166011021" }, "albert_heijn")).toMatchObject({ ok: true, match: { matchType: "exact" } });
    expect(provider.calls).toEqual(["albert_heijn|8718166011021"]);
  });

  it("falls back to the name when the EAN finds nothing or its daily ceiling is reached", async () => {
    const none = fake((q) => ({ ok: true, rows: q === "8718166011021" ? [] : [ARLA] }));
    expect(await createOfferLookup(none, () => NOW).find({ ...arla, ean: "8718166011021" }, "albert_heijn")).toMatchObject({ match: { matchType: "exact" } });
    expect(none.calls).toHaveLength(2);

    const capped = fake((q): SearchResult => (q === "8718166011021" ? { ok: false, code: "ean-limit" } : { ok: true, rows: [ARLA] }));
    expect(await createOfferLookup(capped, () => NOW).find({ ...arla, ean: "8718166011021" }, "albert_heijn")).toMatchObject({ ok: true });
  });

  it("12. a provider failure is reported, not answered as 'no offer', and not cached", async () => {
    let up = false;
    const provider = fake((): SearchResult => (up ? { ok: true, rows: [ARLA] } : { ok: false, code: "unavailable" }));
    const lookup = createOfferLookup(provider, () => NOW);
    expect(await lookup.find(arla, "albert_heijn")).toEqual({ ok: false, code: "unavailable" });
    up = true;
    expect(await lookup.find(arla, "albert_heijn")).toMatchObject({ ok: true, match: { matchType: "likely" } });
  });
});

describe("POST /api/offers/match", () => {
  let server: Server | undefined;
  const logs: Record<string, unknown>[] = [];
  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
    logs.length = 0;
  });

  async function start(find: (product: OfferProduct, retailer: string) => Promise<unknown>, perIpPerHour = 300) {
    const limits = (hour: number) =>
      createLimits({ perIpPerHour: hour, perIpPerDay: 1500, dailyRequests: 20000, dailyBudgetUsd: 1, inputUsdPerMTok: 0, cachedInputUsdPerMTok: 0, outputUsdPerMTok: 0 });
    const handler = createHandler({
      allowedOrigins: ["https://karrieapp.onrender.com"],
      requireOrigin: true,
      configured: true,
      model: "gpt-5.4-mini",
      limits: limits(3),
      recognize: async () => ({ ok: false, code: "unavailable" }) as never,
      offers: { lookup: { find: find as never, stats: () => ({ hits: 0, misses: 0, entries: 0 }) }, limits: limits(perIpPerHour) },
      log: (entry) => logs.push(entry),
    });
    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    return {
      base,
      post: (body: unknown, origin = "https://karrieapp.onrender.com") =>
        fetch(`${base}/api/offers/match`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) }),
    };
  }

  const body = { retailer: "albert_heijn", product: { name: "Melk", aliases: ["halfvolle melk"], category: "dairy", generic: true } };

  it("answers with the match and counts it on /api/health", async () => {
    const seen: unknown[] = [];
    const { post, base } = await start(async (product, retailer) => {
      seen.push({ product, retailer });
      return { ok: true, match: { matchType: "likely", matchConfidence: "medium", offer: ARLA } };
    });
    const response = await post(body);
    expect(response.status).toBe(200);
    const answer = await response.json();
    expect(answer).toMatchObject({ status: "ok", match: { matchType: "likely", offer: { productName: "Arla Biologisch halfvolle melk" } } });
    expect(Date.parse(answer.fetchedAt)).not.toBeNaN();
    expect(seen).toEqual([{ product: body.product, retailer: "albert_heijn" }]);
    const health = await (await fetch(`${base}/api/health`)).json();
    expect(health.offers.outcomes).toEqual({ "albert_heijn-likely": 1 });
    expect(JSON.stringify(logs)).not.toContain("Melk");
  });

  it("refuses unknown supermarkets, extra fields, bad barcodes and other origins", async () => {
    const { post } = await start(async () => ({ ok: true, match: { matchType: "none" } }));
    expect((await post({ ...body, retailer: "plus" })).status).toBe(400);
    expect((await post({ ...body, family: "x" })).status).toBe(400);
    expect((await post({ ...body, product: { ...body.product, ean: "1234567890123" } })).status).toBe(400);
    expect((await post(body, "https://evil.example")).status).toBe(403);
  });

  it("accepts every app department, including meat, breakfast and drinks", async () => {
    const { post } = await start(async () => ({ ok: true, match: { matchType: "none" } }));
    for (const category of ["meat", "breakfast", "drinks", "household"]) {
      expect((await post({ ...body, product: { ...body.product, category } })).status).toBe(200);
    }
  });

  it("12. turns provider trouble into 502 or 429 without breaking anything", async () => {
    let code = "unavailable";
    const { post } = await start(async () => ({ ok: false, code }));
    expect(await (await post(body)).json()).toEqual({ status: "error", code: "unavailable" });
    code = "limit";
    const limited = await post(body);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ status: "error", code: "rate-limited" });
  });

  it("limits each device's requests", async () => {
    const { post } = await start(async () => ({ ok: true, match: { matchType: "none" } }), 1);
    expect((await post(body)).status).toBe(200);
    expect((await post(body)).status).toBe(429);
  });
});
