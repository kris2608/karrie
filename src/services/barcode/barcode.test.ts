import { describe, expect, it } from "vitest";
import type { SavedItem } from "../../domain/types";
import { BARCODE_CLIENT_RULES, createBarcodeLookup } from "./lookup";
import { cleanAnswer } from "./normalize";

const CALVE = "8710400000006";
const OFF_ANSWER = {
  ean: CALVE,
  status: "off-exact",
  product: { name: "Pindakaas", brand: "Calvé", quantity: "350 g", imageUrl: "https://images.openfoodfacts.org/images/products/871/front.jpg", nutriScore: "C", per100: { sugars: 6.5, salt: -1 } },
  source: { kind: "off", name: "Open Food Facts", url: `https://world.openfoodfacts.org/product/${CALVE}`, dataLicense: "ODbL", imageLicense: "CC BY-SA" },
  at: 1,
};

function setup(reply: () => Response, online = true) {
  let time = 1_000_000;
  const cache = new Map<string, unknown>();
  const requests: { url: string; body: string }[] = [];
  const lookup = createBarcodeLookup({
    fetch: async (url, init) => {
      requests.push({ url: String(url), body: String(init?.body) });
      return reply();
    },
    online: () => online,
    origin: "https://api.example/",
    now: () => time,
    readCache: async (ean) => cache.get(ean) as never,
    writeCache: async (ean, entry) => void cache.set(ean, entry),
  });
  return { lookup, requests, cache, advance: (ms: number) => (time += ms) };
}

const ok = (answer: unknown) => () => new Response(JSON.stringify({ status: "ok", answer }), { status: 200 });

describe("barcode answers from the server", () => {
  it("keeps only checked fields, Open Food Facts pictures and the licence of each part", () => {
    expect(cleanAnswer(OFF_ANSWER, CALVE)).toEqual({
      ...OFF_ANSWER,
      product: { name: "Pindakaas", brand: "Calvé", quantity: "350 g", imageUrl: OFF_ANSWER.product.imageUrl, nutriScore: "C", per100: { sugars: 6.5 } },
    });
    expect(cleanAnswer({ ...OFF_ANSWER, product: { ...OFF_ANSWER.product, imageUrl: "https://evil.example/x.jpg" } }, CALVE)?.status).toBe("off-exact");
    expect(cleanAnswer({ ...OFF_ANSWER, ean: "8712345678906" }, CALVE)).toBeNull();
    expect(cleanAnswer({ ...OFF_ANSWER, status: "web-page" }, CALVE)).toBeNull();
    expect(cleanAnswer({ ...OFF_ANSWER, source: { kind: "off", url: "http://insecure.example" } }, CALVE)).toBeNull();
  });

  it("keeps OFF nutrition and photo on a web-page (PrijsProfeet) answer", () => {
    const merged = {
      ean: CALVE,
      status: "web-page" as const,
      product: {
        name: "Campina vanillevla",
        brand: "Campina",
        quantity: "1 l",
        nutriScore: "B" as const,
        per100: { sugars: 12 },
        ingredients: "melk, suiker",
        imageUrl: "https://images.openfoodfacts.org/images/products/871/front.jpg",
      },
      source: { kind: "web" as const, name: "Jumbo", url: "https://www.jumbo.com/producten/campina" },
      at: 1,
    };
    expect(cleanAnswer(merged, CALVE)).toMatchObject({
      status: "web-page",
      product: {
        name: "Campina vanillevla",
        nutriScore: "B",
        per100: { sugars: 12 },
        ingredients: "melk, suiker",
        imageUrl: merged.product.imageUrl,
      },
      source: { kind: "web", name: "Jumbo" },
    });
  });
});

describe("barcode lookup on the device", () => {
  it("uses a product the parent confirmed before, without a request", async () => {
    const { lookup, requests } = setup(ok(OFF_ANSWER));
    const mine = [{ name: "Onze pindakaas", ean: CALVE, productId: "pindakaas", icon: "pindakaas", category: "pantry", quantity: 1 } as SavedItem];
    expect(await lookup(CALVE, mine)).toMatchObject({ status: "mine", item: { name: "Onze pindakaas" } });
    expect(requests).toHaveLength(0);
  });

  it("asks the server once per code, then answers from the cache for 30 days", async () => {
    const { lookup, requests, advance } = setup(ok(OFF_ANSWER));
    const [a, b] = await Promise.all([lookup(CALVE, []), lookup(CALVE, [])]);
    expect(a).toBe(b);
    expect(a).toMatchObject({ status: "found", cached: false, answer: { status: "off-exact" } });
    expect(requests).toEqual([{ url: "https://api.example/api/products/barcode", body: JSON.stringify({ ean: CALVE }) }]);
    expect(await lookup(CALVE, [])).toMatchObject({ status: "found", cached: true });
    advance(BARCODE_CLIENT_RULES.foundTtlMs + 1);
    await lookup(CALVE, []);
    expect(requests).toHaveLength(2);
  });

  it("remembers a miss for a day and never caches an error", async () => {
    const miss = setup(ok({ ean: CALVE, status: "none", at: 1 }));
    expect(await miss.lookup(CALVE, [])).toEqual({ status: "none", ean: CALVE });
    await miss.lookup(CALVE, []);
    expect(miss.requests).toHaveLength(1);
    miss.advance(BARCODE_CLIENT_RULES.missTtlMs + 1);
    await miss.lookup(CALVE, []);
    expect(miss.requests).toHaveLength(2);

    const down = setup(() => new Response(JSON.stringify({ status: "error", code: "unavailable" }), { status: 502 }));
    expect(await down.lookup(CALVE, [])).toEqual({ status: "error", ean: CALVE, code: "unavailable" });
    expect(down.cache.size).toBe(0);
  });

  it("soft-revalidates a cached found answer after six hours when online", async () => {
    const { lookup, requests, advance } = setup(ok(OFF_ANSWER));
    await lookup(CALVE, []);
    expect(requests).toHaveLength(1);
    advance(BARCODE_CLIENT_RULES.revalidateAfterMs + 1);
    expect(await lookup(CALVE, [])).toMatchObject({ status: "found", cached: true });
    await Promise.resolve();
    expect(requests).toHaveLength(2);
  });

  it("expires a conflicted pack answer after the short TTL", async () => {
    const conflicted = {
      ...OFF_ANSWER,
      pack: {
        conflict: true,
        sources: [
          { source: "openfoodfacts", quantityRaw: "220 ml", quantityMl: 220 },
          { source: "prijsprofeet", quantityRaw: "1 l", quantityMl: 1000 },
        ],
      },
    };
    const { lookup, requests, advance } = setup(ok(conflicted));
    await lookup(CALVE, []);
    advance(BARCODE_CLIENT_RULES.conflictTtlMs + 1);
    await lookup(CALVE, []);
    expect(requests).toHaveLength(2);
  });

  it("reports limits and offline, keeps an old answer when the server cannot be reached and rejects invalid codes", async () => {
    const limited = setup(() => new Response(JSON.stringify({ status: "error", code: "rate-limited" }), { status: 429 }));
    expect(await limited.lookup(CALVE, [])).toMatchObject({ status: "limit", code: "rate-limited" });

    const offline = setup(ok(OFF_ANSWER), false);
    expect(await offline.lookup(CALVE, [])).toEqual({ status: "offline", ean: CALVE });
    offline.cache.set(CALVE, { answer: OFF_ANSWER, savedAt: 0 });
    expect(await offline.lookup(CALVE, [])).toMatchObject({ status: "found", cached: true });
    expect(offline.requests).toHaveLength(0);

    expect(await limited.lookup("8710400000007", [])).toMatchObject({ status: "error", code: "invalid" });
  });

  it("force-refresh hits the API even with a fresh cache and writes the new answer", async () => {
    const repaired = {
      ...OFF_ANSWER,
      product: { ...OFF_ANSWER.product, name: "Calvé Pindakaas sticky", quantity: "600 g" },
      catalogProductId: "b-calve",
      catalogVariantId: "abcdef0123456789",
      at: 2,
    };
    const { lookup, requests, cache } = setup(ok(repaired));
    cache.set(CALVE, { answer: OFF_ANSWER, savedAt: 1_000_000 });
    expect(await lookup.refresh(CALVE)).toMatchObject({
      status: "found",
      cached: false,
      answer: { product: { name: "Calvé Pindakaas sticky", quantity: "600 g" }, catalogProductId: "b-calve" },
    });
    expect(requests).toHaveLength(1);
    expect(cache.get(CALVE)).toMatchObject({ answer: { product: { quantity: "600 g" } } });
  });

  it("force-refresh stays offline without a request", async () => {
    const { lookup, requests } = setup(ok(OFF_ANSWER), false);
    expect(await lookup.refresh(CALVE)).toEqual({ status: "offline", ean: CALVE });
    expect(requests).toHaveLength(0);
  });
});