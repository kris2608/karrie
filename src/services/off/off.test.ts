import { describe, expect, it, vi } from "vitest";
import { productUrl } from "./client";
import { createLookup, LOOKUP_RULES, type LookupDeps } from "./lookup";
import { normalizeOffProduct } from "./normalize";

const NUTELLA = {
  code: "3017620422003",
  product_name: "Nutella",
  product_name_nl: "Nutella",
  brands: "Nutella, Ferrero",
  quantity: "400 g e",
  image_front_url: "https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.633.400.jpg",
  categories_tags: ["en:spreads", "en:hazelnut-spreads"],
  nutriscore_grade: "e",
  nutriments: { "energy-kcal_100g": 539, sugars_100g: 56.3 },
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function setup(responses: (() => Response | Promise<Response>)[]) {
  const cache = new Map<string, unknown>();
  let clock = 1_000_000;
  const sleeps: number[] = [];
  const fetch = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("geen antwoord meer");
    return next();
  });
  const deps: LookupDeps = {
    fetch: fetch as unknown as typeof globalThis.fetch,
    readCache: async (ean) => cache.get(ean) as never,
    writeCache: async (ean, entry) => void cache.set(ean, entry),
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    online: () => true,
  };
  return { lookup: createLookup(deps), fetch, cache, sleeps, deps, advance: (ms: number) => (clock += ms) };
}

describe("open food facts", () => {
  it("vraagt alleen de barcode op met de juiste velden", () => {
    const url = new URL(productUrl("3017620422003"));
    expect(url.pathname).toBe("/api/v3/product/3017620422003");
    expect(url.searchParams.get("lc")).toBe("nl");
    expect(url.searchParams.get("app_name")).toBe("Karrie");
    expect(url.searchParams.get("fields")).toContain("image_front_url");
  });

  it("normaliseert naam, merk, inhoud, foto en voeding", () => {
    const product = normalizeOffProduct("3017620422003", NUTELLA);
    expect(product).toMatchObject({ name: "Nutella", brand: "Nutella", packageSize: "400 g e" });
    expect(product.imageUrl).toContain("images.openfoodfacts.org");
    expect(product.nutrition).toEqual({ nutriscore: "e", energyKcal100g: 539, sugars100g: 56.3 });
    expect(product).toMatchObject({ category: "pantry", matchProductId: undefined });
    expect(normalizeOffProduct("1", { image_front_url: "http://evil.example/x.jpg" }).imageUrl).toBeUndefined();
    expect(normalizeOffProduct("1", { product_name: "   " }).name).toBeUndefined();
  });

  it("valt terug op de algemene naam en foto zonder iets te verzinnen", () => {
    const noDutch = normalizeOffProduct("1", {
      product_name: "Peanut butter",
      image_url: "https://images.openfoodfacts.org/images/products/1/front.jpg",
      categories_tags: ["en:peanut-butters"],
    });
    expect(noDutch).toMatchObject({ name: "Peanut butter", matchProductId: "pindakaas", category: "pantry" });
    expect(noDutch.imageUrl).toContain("/front.jpg");
    const bare = normalizeOffProduct("1", {});
    expect(bare).toEqual({ ean: "1", categoryTags: [], category: "pantry", name: undefined, brand: undefined, packageSize: undefined, imageUrl: undefined, nutrition: undefined, matchProductId: undefined });
  });

  it("vindt een product en gebruikt daarna de cache", async () => {
    const { lookup, fetch } = setup([() => json({ status: "success", product: NUTELLA })]);
    const first = await lookup("3017620422003");
    expect(first).toMatchObject({ status: "found", cached: false, product: { name: "Nutella" } });
    const second = await lookup("3017620422003");
    expect(second).toMatchObject({ status: "found", cached: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("meldt onbekende en ongeldige codes", async () => {
    const { lookup, fetch } = setup([() => json({ status: "failure", errors: [] }, 404)]);
    expect(await lookup("0000000000000")).toEqual({ status: "not-found", ean: "0000000000000" });
    expect(await lookup("0000000000000")).toEqual({ status: "not-found", ean: "0000000000000" });
    expect(await lookup("12345")).toEqual({ status: "invalid" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("vraagt een onbekende code na een dag opnieuw", async () => {
    const { lookup, fetch, advance } = setup([
      () => json({ status: "failure" }, 404),
      () => json({ status: "success", product: NUTELLA }),
    ]);
    await lookup("3017620422003");
    advance(LOOKUP_RULES.notFoundTtl + 1);
    expect((await lookup("3017620422003")).status).toBe("found");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("voegt gelijktijdige scans van dezelfde code samen", async () => {
    const { lookup, fetch } = setup([() => json({ status: "success", product: NUTELLA })]);
    const [a, b] = await Promise.all([lookup("3017620422003"), lookup("3017620422003")]);
    expect(a).toBe(b);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("houdt minstens 700 ms tussen verzoeken", async () => {
    const { lookup, sleeps } = setup([
      () => json({ status: "failure" }, 404),
      () => json({ status: "failure" }, 404),
    ]);
    await lookup("3017620422003");
    await lookup("8710400000006");
    expect(sleeps).toEqual([LOOKUP_RULES.minGapMs]);
  });

  it("probeert opnieuw bij 429 en volgt Retry-After", async () => {
    const { lookup, sleeps, fetch } = setup([
      () => json({}, 429, { "Retry-After": "2" }),
      () => json({}, 503),
      () => json({ status: "success", product: NUTELLA }),
    ]);
    expect((await lookup("3017620422003")).status).toBe("found");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleeps).toContain(2000);
    expect(sleeps).toContain(3000);
  });

  it("geeft na twee herhalingen op en meldt offline of fout", async () => {
    const failing = setup([
      () => Promise.reject(new TypeError("Failed to fetch")),
      () => Promise.reject(new TypeError("Failed to fetch")),
      () => Promise.reject(new TypeError("Failed to fetch")),
    ]);
    expect(await failing.lookup("3017620422003")).toEqual({ status: "offline", ean: "3017620422003" });
    expect(failing.fetch).toHaveBeenCalledTimes(3);

    const broken = setup([() => json({}, 500)]);
    expect(await broken.lookup("3017620422003")).toEqual({ status: "error", ean: "3017620422003" });
    expect(broken.fetch).toHaveBeenCalledTimes(1);
  });

  it("gebruikt offline een eerder gevonden product, ook als het oud is", async () => {
    const { lookup, deps, advance, fetch } = setup([() => json({ status: "success", product: NUTELLA })]);
    await lookup("3017620422003");
    advance(LOOKUP_RULES.foundTtl + 1);
    deps.online = () => false;
    expect(await lookup("3017620422003")).toMatchObject({ status: "found", cached: true });
    expect(await lookup("8710400000006")).toEqual({ status: "offline", ean: "8710400000006" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stopt netjes als de scan wordt afgebroken", async () => {
    const controller = new AbortController();
    const { lookup } = setup([
      () => {
        controller.abort();
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      },
    ]);
    expect(await lookup("3017620422003", { signal: controller.signal })).toEqual({ status: "aborted" });
  });

  it("zet UPC-A om naar 13 cijfers", async () => {
    const { lookup, fetch } = setup([() => json({ status: "failure" }, 404)]);
    await lookup("036000291452");
    expect(String(fetch.mock.calls[0])).toContain("/product/0036000291452");
  });
});
