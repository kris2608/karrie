import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createHandler } from "./app.js";
import { createLimits } from "./limits.js";
import type { OfferRow, SearchResult } from "./offers/prijsprofeet.js";
import { createStoreImageLookup, STORE_IMAGE_RULES, type StoreImageResult } from "./storeImage.js";

const NOW = Date.parse("2026-11-07T10:00:00Z");
const EAN = "8710496978722";
const IMAGE = "https://static.ah.nl/dam/product/AHI_4354523130313137313331?revLabel=1&rendition=800x800_WEBP&fileType=binary";

const row = (patch: Partial<OfferRow> = {}): OfferRow => ({
  retailer: "albert_heijn",
  sourceProductId: "ah_wi62618",
  productName: "De Ruijter Kleintjes hagelslag",
  brand: "De Ruijter",
  ean: EAN,
  promotionStatus: "expired",
  imageUrl: IMAGE,
  sourceUrl: "https://www.ah.nl/producten/product/wi62618/de-ruijter-kleintjes-hagelslag",
  ...patch,
});

function provider(answer: (ean: string) => SearchResult | Promise<SearchResult>) {
  const calls: string[] = [];
  return { calls, searchImage: async (ean: string) => (calls.push(ean), answer(ean)) };
}

describe("store image lookup", () => {
  it("only takes a photo from a row with exactly the scanned barcode, never a similar name", async () => {
    const similar = provider(() => ({ ok: true, rows: [row({ ean: "8710496978739" }), row({ ean: undefined })] }));
    expect(await createStoreImageLookup(similar, () => NOW).find(EAN)).toEqual({ ok: true, image: null, cached: false });

    const exact = provider(() => ({ ok: true, rows: [row({ ean: "8710496978739", imageUrl: "https://static.ah.nl/dam/product/other" }), row({ retailer: "jumbo", imageUrl: undefined }), row()] }));
    expect(await createStoreImageLookup(exact, () => NOW).find(EAN)).toEqual({
      ok: true,
      cached: false,
      image: {
        ean: EAN,
        imageUrl: IMAGE,
        retailer: "albert_heijn",
        sourceUrl: row().sourceUrl,
        productName: "De Ruijter Kleintjes hagelslag",
        brand: "De Ruijter",
      },
    });
  });

  it("matches the leading-zero forms of the same code", async () => {
    const upc = "0012345678905";
    const twelve = provider(() => ({ ok: true, rows: [row({ ean: "012345678905" })] }));
    expect((await createStoreImageLookup(twelve, () => NOW).find(upc)) as StoreImageResult).toMatchObject({ ok: true, image: { ean: upc } });
    const fourteen = provider(() => ({ ok: true, rows: [row({ ean: `0${EAN}` })] }));
    expect(await createStoreImageLookup(fourteen, () => NOW).find(EAN)).toMatchObject({ ok: true, image: { imageUrl: IMAGE } });
  });

  it("caches hits and misses, and shares one call for identical questions", async () => {
    let now = NOW;
    const found = provider(() => ({ ok: true, rows: [row()] }));
    const lookup = createStoreImageLookup(found, () => now);
    const [a, b] = await Promise.all([lookup.find(EAN), lookup.find(EAN)]);
    expect(b).toEqual(a);
    expect(await lookup.find(EAN)).toMatchObject({ ok: true, cached: true });
    expect(found.calls).toEqual([EAN]);
    now += STORE_IMAGE_RULES.foundTtlMs + 1;
    await lookup.find(EAN);
    expect(found.calls).toHaveLength(2);

    now = NOW;
    const empty = provider(() => ({ ok: true, rows: [] }));
    const misses = createStoreImageLookup(empty, () => now);
    await misses.find(EAN);
    await misses.find(EAN);
    expect(empty.calls).toHaveLength(1);
    now += STORE_IMAGE_RULES.missTtlMs + 1;
    await misses.find(EAN);
    expect(empty.calls).toHaveLength(2);
  });

  it("reports limits and failures instead of a miss, and does not keep a limit", async () => {
    let answer: SearchResult = { ok: false, code: "ean-limit" };
    const flaky = provider(() => answer);
    const lookup = createStoreImageLookup(flaky, () => NOW);
    expect(await lookup.find(EAN)).toEqual({ ok: false, code: "limit" });
    answer = { ok: true, rows: [row()] };
    expect(await lookup.find(EAN)).toMatchObject({ ok: true, image: { retailer: "albert_heijn" } });

    const down = createStoreImageLookup(provider(() => ({ ok: false, code: "unavailable" })), () => NOW);
    expect(await down.find(EAN)).toEqual({ ok: false, code: "unavailable" });
    expect(down.cached(EAN)).toEqual({ ok: false, code: "unavailable" });
  });
});

describe("POST /api/images/ean", () => {
  let server: Server | undefined;
  const logs: Record<string, unknown>[] = [];
  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
    logs.length = 0;
  });

  async function start(answer: (ean: string) => SearchResult, perIpPerHour = 300) {
    const limits = (hour: number) =>
      createLimits({ perIpPerHour: hour, perIpPerDay: 1500, dailyRequests: 20000, dailyBudgetUsd: 1, inputUsdPerMTok: 0, cachedInputUsdPerMTok: 0, outputUsdPerMTok: 0 });
    const fake = provider(answer);
    const handler = createHandler({
      allowedOrigins: ["https://www.karrie.eu"],
      requireOrigin: true,
      configured: true,
      model: "gpt-5.4-mini",
      limits: limits(3),
      recognize: async () => ({ ok: false, code: "unavailable" }) as never,
      storeImages: { lookup: createStoreImageLookup(fake, () => NOW), limits: limits(perIpPerHour) },
      log: (entry) => logs.push(entry),
    });
    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    return {
      base,
      calls: fake.calls,
      post: (body: unknown, origin = "https://www.karrie.eu") =>
        fetch(`${base}/api/images/ean`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) }),
    };
  }

  it("answers with the photo link, counts it on /api/health and never logs the URL", async () => {
    const { post, base } = await start(() => ({ ok: true, rows: [row()] }));
    const response = await post({ ean: EAN });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      image: {
        ean: EAN,
        imageUrl: IMAGE,
        retailer: "albert_heijn",
        sourceUrl: row().sourceUrl,
        productName: "De Ruijter Kleintjes hagelslag",
        brand: "De Ruijter",
      },
    });
    const health = await (await fetch(`${base}/api/health`)).json();
    expect(health.storeImages.outcomes).toEqual({ "found-albert_heijn": 1 });
    expect(JSON.stringify(logs)).not.toContain("static.ah.nl");
  });

  it("refuses bad barcodes, extra fields and other origins", async () => {
    const { post, calls } = await start(() => ({ ok: true, rows: [] }));
    expect((await post({ ean: "1234567890123" })).status).toBe(400);
    expect((await post({ ean: EAN, name: "hagelslag" })).status).toBe(400);
    expect((await post({ ean: EAN }, "https://evil.example")).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("limits each device's new lookups, but a cached answer is free", async () => {
    const { post, calls } = await start(() => ({ ok: true, rows: [row()] }), 1);
    expect((await post({ ean: EAN })).status).toBe(200);
    expect((await post({ ean: EAN })).status).toBe(200);
    expect((await post({ ean: "8718166011021" })).status).toBe(429);
    expect(calls).toEqual([EAN]);
  });

  it("turns provider trouble into 429 or 502", async () => {
    const limited = await start(() => ({ ok: false, code: "limit" }));
    expect(await (await limited.post({ ean: EAN })).json()).toEqual({ status: "error", code: "rate-limited" });
  });

  it("is not there when PrijsProfeet images are switched off", async () => {
    const handler = createHandler({
      allowedOrigins: ["https://www.karrie.eu"],
      requireOrigin: true,
      configured: true,
      model: "gpt-5.4-mini",
      limits: createLimits({ perIpPerHour: 3, perIpPerDay: 3, dailyRequests: 3, dailyBudgetUsd: 1, inputUsdPerMTok: 0, cachedInputUsdPerMTok: 0, outputUsdPerMTok: 0 }),
      recognize: async () => ({ ok: false, code: "unavailable" }) as never,
      log: () => undefined,
    });
    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/images/ean`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://www.karrie.eu" }, body: JSON.stringify({ ean: EAN }) });
    expect(response.status).toBe(503);
  });
});
