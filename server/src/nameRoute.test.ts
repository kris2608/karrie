import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createHandler } from "./app.js";
import { createCandidateStore } from "./candidates.js";
import { createLimits } from "./limits.js";
import { createNameImageLookup } from "./nameImage.js";
import type { OfferRow, SearchResult } from "./offers/prijsprofeet.js";
import type { OffSearchResult } from "./offSearch.js";

const IMAGE = "https://static.ah.nl/dam/product/chocomel-vol.jpg";
const offer = (productName: string, quantity: string, patch: Partial<OfferRow> = {}): OfferRow => ({
  retailer: "albert_heijn",
  sourceProductId: productName,
  productName,
  brand: "Chocomel",
  quantity,
  ean: "8712345678906",
  category: "zuivel-eieren",
  imageUrl: `https://static.ah.nl/dam/product/${encodeURIComponent(productName)}.jpg`,
  sourceUrl: "https://www.ah.nl/producten/product/wi1/chocomel",
  promotionStatus: "active",
  ...patch,
});
const ROWS = [offer("Chocomel Vol", "1 l", { imageUrl: IMAGE }), offer("Chocomel Vol 0% suiker toegevoegd", "1 l"), offer("Chocomel Vol blik 4 x 6 x 250ML", "4 x 6 x 250 ml", { retailer: "jumbo", imageUrl: "https://www.jumbo.com/dam-images/blik.jpg" })];

describe("POST /api/images/name", () => {
  let server: Server | undefined;
  const logs: Record<string, unknown>[] = [];
  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
    logs.length = 0;
  });

  async function start(answer: (q: string) => SearchResult = () => ({ ok: true, rows: ROWS }), off: OffSearchResult = { ok: true, rows: [] }, perIpPerHour = 300) {
    const calls = { pp: [] as string[], off: [] as string[] };
    const limits = (hour: number) =>
      createLimits({ perIpPerHour: hour, perIpPerDay: 1500, dailyRequests: 20000, dailyBudgetUsd: 1, inputUsdPerMTok: 0, cachedInputUsdPerMTok: 0, outputUsdPerMTok: 0 });
    const candidates = createCandidateStore();
    const lookup = createNameImageLookup({
      prijsProfeet: { searchName: async (q) => (calls.pp.push(q), answer(q)) },
      off: { search: async (q) => (calls.off.push(q), off) },
    });
    const handler = createHandler({
      allowedOrigins: ["https://www.karrie.eu"],
      requireOrigin: true,
      configured: true,
      model: "gpt-5.4-mini",
      limits: limits(3),
      recognize: async () => ({ ok: false, code: "unavailable" }) as never,
      nameImages: { lookup, limits: limits(perIpPerHour) },
      products: { normalize: async () => ({ ok: false, code: "unavailable" }), candidates, limits: limits(30) },
      log: (entry) => logs.push(entry),
    });
    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    return {
      base,
      calls,
      candidates,
      post: (body: unknown, ip = "10.0.0.1", origin = "https://www.karrie.eu") =>
        fetch(`${base}/api/images/name`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-Forwarded-For": ip }, body: JSON.stringify(body) }),
    };
  }

  it("answers Chocomel with the regular pack, records a branded candidate and never sends a barcode", async () => {
    const { post, candidates, base } = await start();
    const response = await post({ name: "Chocomel" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: "ok",
      result: { classification: "branded", brand: "Chocomel", match: { source: "prijsprofeet", productName: "Chocomel Vol", imageUrl: IMAGE, retailer: "albert_heijn" }, searched: { prijsprofeet: "match", off: "skipped" } },
    });
    expect(JSON.stringify(body)).not.toContain("8712345678906");
    expect(candidates.list()).toEqual([expect.objectContaining({ classification: "branded", brand: "Chocomel", prijsprofeetMatch: true, offMatch: false, imageAvailable: true, category: "dairy" })]);
    const health = await (await fetch(`${base}/api/health`)).json();
    expect(health.nameImages.outcomes).toEqual({ "branded-prijsprofeet": 1 });
    expect(health.products.candidates).toMatchObject({ branded: 1, storage: "memory" });
    expect(JSON.stringify(logs)).not.toMatch(/chocomel|static\.ah\.nl/i);
  });

  it("counts Chocomel blik with Chocomel, and keeps 0% suiker apart", async () => {
    const { post, candidates, calls } = await start();
    await post({ name: "Chocomel" }, "10.0.0.1");
    const can = await (await post({ name: "Chocomel blik" }, "10.0.0.2")).json();
    expect(can.result.match.productName).toBe("Chocomel Vol blik 4 x 6 x 250ML");
    await post({ name: "Chocomel 0% suiker" }, "10.0.0.3");
    expect(calls.pp).toEqual(["chocomel", "chocomel 0% suiker"]);
    const [plain, zero] = [candidates.list().find((candidate) => !candidate.variant), candidates.list().find((candidate) => candidate.variant)];
    expect(plain).toMatchObject({ usageCount: 2, requestedPackaging: ["blik"] });
    expect(zero).toMatchObject({ variant: "0% suiker", usageCount: 1 });
  });

  it("asks Open Food Facts when PrijsProfeet has nothing, and records an unknown name without a photo", async () => {
    const { post, candidates, calls } = await start(() => ({ ok: true, rows: [] }));
    const body = await (await post({ name: "walnoten" })).json();
    expect(body.result).toMatchObject({ classification: "unknown", match: null, searched: { prijsprofeet: "none", off: "none" } });
    expect(calls.off).toEqual(["walnoten"]);
    expect(candidates.list()[0]).toMatchObject({ classification: "unknown", imageAvailable: false });
  });

  it("refuses bad bodies, phrases and other origins before searching", async () => {
    const { post, calls } = await start();
    expect((await post({ name: "Chocomel", list: ["melk"] })).status).toBe(400);
    expect((await post({ name: "x".repeat(41) })).status).toBe(400);
    expect((await post({ name: "iets lekkers voor bij de koffie" })).status).toBe(422);
    expect((await post({ name: "Chocomel" }, "10.0.0.1", "https://evil.example")).status).toBe(403);
    expect(calls.pp).toEqual([]);
  });

  it("limits new searches per device, while a cached answer stays free", async () => {
    const { post, calls } = await start(undefined, undefined, 1);
    expect((await post({ name: "Chocomel" })).status).toBe(200);
    expect((await post({ name: "chocomel" })).status).toBe(200);
    expect((await post({ name: "Nutella" })).status).toBe(429);
    expect(calls.pp).toEqual(["chocomel"]);
  });

  it("turns a PrijsProfeet limit into 429 and an outage into 502 without recording a candidate", async () => {
    const limited = await start(() => ({ ok: false, code: "limit" }));
    expect(await (await limited.post({ name: "Chocomel" })).json()).toEqual({ status: "error", code: "rate-limited" });
    expect(limited.candidates.list()).toEqual([]);
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    const down = await start(() => ({ ok: true, rows: [] }), { ok: false, code: "unavailable" });
    expect((await down.post({ name: "Nutella" })).status).toBe(502);
    expect(down.candidates.list()).toEqual([]);
  });
});
