import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createHandler } from "./app.js";
import {
  createImageDiscovery,
  decide,
  englishTerm,
  identityKey,
  leadForPage,
  leadsFromBrave,
  leadsFromOpenAi,
  leadsFromOpenverse,
  openverseUrl,
  matchOf,
  ogImage,
  plainUnsplash,
  shareable,
  type Discovery,
  type ImageIdentity,
  type Resolved,
  type Verdict,
} from "./images.js";
import { raw, SHOP_PAGE } from "../test/fixtures.js";
import { createLimits } from "./limits.js";

const TERRA: ImageIdentity = { name: "Pindakaas", brand: "AH Terra", variant: "100% naturel", size: "350 g", generic: false };
const BANAAN: ImageIdentity = { name: "Banaan", generic: true };
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]), Buffer.alloc(3000)]);

const verdict = (overrides: Partial<Verdict> = {}): Verdict => ({
  index: 0,
  productType: "same",
  brand: "same",
  variant: "same",
  size: "not-visible",
  frontFacing: true,
  clear: true,
  asSold: true,
  brandVisible: true,
  plainBackground: true,
  people: false,
  ...overrides,
});

const resolved = (overrides: Partial<Resolved> = {}): Resolved => ({
  imageUrl: "https://shop.example/terra.jpg",
  sourcePageUrl: "https://shop.example/terra",
  provider: "openai-web",
  usageRightsStatus: "unknown",
  sourceName: "shop.example",
  cors: false,
  dataUrl: "data:image/jpeg;base64,AAAA",
  ...overrides,
});

describe("identityKey", () => {
  it("keeps brands, variants and sizes apart and ignores brand for generic products", () => {
    expect(identityKey(TERRA)).not.toBe(identityKey({ ...TERRA, variant: "crunchy" }));
    expect(identityKey(TERRA)).not.toBe(identityKey({ ...TERRA, size: "600 g" }));
    expect(identityKey(TERRA)).toBe(identityKey({ ...TERRA, brand: "ah terra", name: " pindakaas " }));
    expect(identityKey({ name: "Banaan", brand: "Chiquita", generic: true })).toBe(identityKey(BANAAN));
    expect(identityKey({ name: "Crème fraîche", generic: true })).toBe(identityKey({ name: "creme fraiche", generic: true }));
  });
});

describe("leads", () => {
  it("classifies pages and refuses unsafe or useless ones", () => {
    expect(leadForPage("https://commons.wikimedia.org/wiki/File:Banana.jpg", undefined, "openai-web")).toMatchObject({ kind: "commons", fileTitle: "File:Banana.jpg" });
    expect(leadForPage("https://commons.wikimedia.org/wiki/Category:Bananas", undefined, "openai-web")).toBeNull();
    expect(leadForPage("https://unsplash.com/photos/abc", "Banana", "openai-web")).toMatchObject({ kind: "page", open: true });
    expect(leadForPage("https://www.ah.nl/producten/product/wi1", "Terra", "openai-web")).toMatchObject({ kind: "page", open: false });
    expect(leadForPage("https://www.istockphoto.com/photo/x", undefined, "openai-web")).toBeNull();
    expect(leadForPage("http://shop.example/x", undefined, "openai-web")).toBeNull();
    expect(leadForPage("https://127.0.0.1/x", undefined, "openai-web")).toBeNull();
    expect(leadForPage("https://nl.wikipedia.org/wiki/Banaan", undefined, "openai-web")).toBeNull();
  });

  it("reads image results first, then text results, without duplicates", () => {
    const { leads, searchCalls, imageResults } = leadsFromOpenAi({
      output: [
        {
          type: "web_search_call",
          action: { type: "search" },
          results: [
            { type: "image_result", image_url: "https://img.example/a.jpg", source_website_url: "https://shop.example/a", caption: "Terra" },
            { type: "text_result", url: "https://shop.example/b?utm_source=x", title: "B" },
            { type: "text_result", url: "https://shop.example/b", title: "B again" },
          ],
        },
        { type: "message", content: [{ type: "output_text", text: "OK" }] },
      ],
    });
    expect(searchCalls).toBe(1);
    expect(imageResults).toBe(1);
    expect(leads).toEqual([
      expect.objectContaining({ kind: "image", imageUrl: "https://img.example/a.jpg" }),
      expect.objectContaining({ kind: "page", sourcePageUrl: "https://shop.example/b" }),
    ]);
  });

  it("maps documented Brave image results to the original picture and its page", () => {
    const leads = leadsFromBrave({
      results: [
        {
          title: "Calvé Pindakaas",
          url: "https://www.jumbo.com/producten/calve-pindakaas",
          source: "jumbo.com",
          thumbnail: { src: "https://imgs.search.brave.com/abc" },
          properties: { url: "https://static.jumbo.com/calve.png" },
        },
        { title: "stock", url: "https://www.shutterstock.com/x", properties: { url: "https://image.shutterstock.com/x.jpg" } },
      ],
    });
    expect(leads).toEqual([
      { kind: "image", imageUrl: "https://static.jumbo.com/calve.png", thumbnailUrl: "https://imgs.search.brave.com/abc", sourcePageUrl: "https://www.jumbo.com/producten/calve-pindakaas", title: "Calvé Pindakaas", provider: "brave" },
    ]);
  });

  it("takes the plain English term from the model's own search queries", () => {
    const action = { type: "search", queries: ["site:commons.wikimedia.org cucumber isolated", "site:unsplash.com cucumber isolated"], query: "site:commons.wikimedia.org cucumber isolated" };
    expect(englishTerm({ output: [{ type: "web_search_call", action }] })).toBe("cucumber");
    expect(englishTerm({ output: [{ type: "web_search_call", action: { type: "search", query: "whole wheat bread white background" } }] })).toBe("whole wheat bread");
    expect(englishTerm({ output: [{ type: "message" }] })).toBeUndefined();
  });

  it("keeps only open-licence Openverse photos whose title names the product, served by Openverse itself", () => {
    const url = new URL(openverseUrl("banana"));
    expect(url.searchParams.get("license")).toBe("cc0,pdm,by,by-sa");
    expect(url.searchParams.get("source")).toBe("stocksnap,rawpixel");
    const leads = leadsFromOpenverse(
      {
        results: [
          { title: "Banana Foliage", foreign_landing_url: "https://stocksnap.io/photo/a", thumbnail: "https://api.openverse.org/v1/images/a/thumb/", license: "cc0", source: "stocksnap" },
          { title: "Beach", foreign_landing_url: "https://stocksnap.io/photo/b", thumbnail: "https://api.openverse.org/v1/images/b/thumb/", license: "cc0", source: "stocksnap" },
          { title: "Bananas Fruits", foreign_landing_url: "https://www.rawpixel.com/image/c", thumbnail: "https://api.openverse.org/v1/images/c/thumb/", license: "by", license_version: "4.0", creator: "<b>Ann</b>", source: "rawpixel" },
          { title: "Banana", foreign_landing_url: "https://x.example/d", thumbnail: "https://x.example/d.jpg", license: "cc0" },
          { title: "Banana", foreign_landing_url: "https://x.example/e", thumbnail: "https://api.openverse.org/v1/images/e/thumb/", license: "by-nc" },
        ],
      },
      "bananas",
      "openai-web",
    );
    expect(leads.map((lead) => lead.sourcePageUrl)).toEqual(["https://stocksnap.io/photo/a", "https://www.rawpixel.com/image/c"]);
    expect(leads[1]).toMatchObject({ kind: "open-image", license: "CC BY 4.0", sourceName: "Rawpixel", attribution: "Ann · CC BY 4.0 · Rawpixel via Openverse" });
  });

  it("finds og:image in either attribute order and strips the Unsplash overlay", () => {
    expect(ogImage('<meta property="og:image" content="https://a.example/x.jpg?a=1&amp;b=2">')).toBe("https://a.example/x.jpg?a=1&b=2");
    expect(ogImage('<meta content="https://a.example/y.jpg" name="twitter:image">')).toBe("https://a.example/y.jpg");
    expect(ogImage("<meta name=description content=x>")).toBeUndefined();
    expect(plainUnsplash("https://images.unsplash.com/photo-1?ixlib=rb&mark=logo&w=1200")).toBe("https://images.unsplash.com/photo-1?w=640&q=80&fit=max&fm=jpg");
    expect(plainUnsplash("https://evil.example/photo-1")).toBeUndefined();
  });
});

describe("matching", () => {
  it("never treats another brand, variant, size or a person as the product", () => {
    expect(matchOf(TERRA, verdict())).toBe("exact");
    expect(matchOf(TERRA, verdict({ brand: "different" }))).toBe("mismatch");
    expect(matchOf(TERRA, verdict({ variant: "different" }))).toBe("mismatch");
    expect(matchOf(TERRA, verdict({ size: "different" }))).toBe("mismatch");
    expect(matchOf(TERRA, verdict({ productType: "different" }))).toBe("mismatch");
    expect(matchOf(TERRA, verdict({ people: true }))).toBe("mismatch");
    expect(matchOf(TERRA, verdict({ brand: "not-visible" }))).toBe("unverified");
    expect(matchOf(BANAAN, verdict({ brand: "not-visible" }))).toBe("same-type");
  });

  it("applies open-licence pictures, keeps unclear rights personal and asks a parent otherwise", () => {
    const open = resolved({ imageUrl: "https://images.unsplash.com/b", usageRightsStatus: "permitted", sourceName: "Unsplash" });
    const generic = { brand: "not-visible" as const, brandVisible: false };
    expect(decide(BANAAN, [open], [verdict(generic)], "openai-web", 1)).toMatchObject({ status: "found", selected: 0 });
    expect(decide(TERRA, [resolved()], [verdict()], "openai-web", 1)).toMatchObject({ status: "personal", selected: 0 });
    expect(decide(TERRA, [resolved()], [verdict({ brand: "not-visible" })], "openai-web", 1)).not.toHaveProperty("selected");
    expect(decide(BANAAN, [open], [verdict({ ...generic, asSold: false })], "openai-web", 1).status).toBe("review");
    expect(decide(BANAAN, [open], [verdict({ brandVisible: true, brand: "not-visible" })], "openai-web", 1).status).toBe("review");
    expect(decide(TERRA, [resolved()], [verdict({ brand: "different" })], "openai-web", 1)).toMatchObject({ status: "none", candidates: [] });
  });

  it("ranks the whole, child-ready picture above a close-up", () => {
    const closeUp = resolved({ imageUrl: "https://images.unsplash.com/slice", usageRightsStatus: "permitted" });
    const whole = resolved({ imageUrl: "https://images.unsplash.com/whole", usageRightsStatus: "permitted" });
    const generic = { brand: "not-visible" as const, brandVisible: false };
    const discovery = decide(BANAAN, [closeUp, whole], [verdict({ ...generic, asSold: false }), verdict({ ...generic, index: 1 })], "openai-web", 1);
    expect(discovery.candidates[discovery.selected!].imageUrl).toBe("https://images.unsplash.com/whole");
  });

  it("shares only open-licence pictures with other devices", () => {
    const personal: Discovery = { status: "personal", selected: 0, candidates: [{ ...resolved(), matchingStatus: "exact" }], provider: "openai-web", searchedAt: 1 };
    expect(shareable(personal)).toBeNull();
    const mixed: Discovery = { ...personal, status: "found", candidates: [{ ...resolved({ usageRightsStatus: "permitted" }), matchingStatus: "same-type" }, ...personal.candidates] };
    expect(shareable(mixed)?.candidates).toHaveLength(1);
    const facts = { nutriScore: "B" as const, sourceUrl: "https://shop.example/terra", sourceName: "shop.example", readAt: 1 };
    expect(shareable({ ...mixed, facts })?.facts).toEqual(facts);
    expect(shareable({ status: "none", candidates: [], provider: "openai-web", searchedAt: 1 })?.status).toBe("none");
  });
});

/** A shop page for Terra, an Unsplash page for bananas, and one page that redirects to a private address. */
function fakeWeb(calls: string[]) {
  return async (url: string) => {
    calls.push(url);
    if (url === "https://shop.example/terra") return new Response('<meta property="og:image" content="https://shop.example/terra.jpg">', { headers: { "content-type": "text/html" } });
    if (url === "https://shop.example/terra.jpg") return new Response(JPEG, { headers: { "content-type": "image/jpeg" } });
    if (url === "https://unsplash.com/photos/banana") return new Response('<meta property="og:image" content="https://images.unsplash.com/photo-9?mark=x">', { headers: { "content-type": "text/html" } });
    if (url.startsWith("https://images.unsplash.com/photo-9")) return new Response(JPEG, { headers: { "content-type": "image/jpeg", "access-control-allow-origin": "*" } });
    if (url === "https://shop.example/moved") return new Response(null, { status: 302, headers: { location: "https://10.0.0.5/admin" } });
    return new Response("nope", { status: 404 });
  };
}

function fakeOpenAi(pages: string[], verdicts: Partial<Verdict>[], queries?: string[]) {
  const bodies: { tools?: unknown }[] = [];
  return {
    bodies,
    client: {
      responses: {
        create: async (body: never) => {
          bodies.push(body);
          if ((body as { tools?: unknown }).tools)
            return {
              output: [{ type: "web_search_call", action: { type: "search", queries }, results: pages.map((url) => ({ type: "text_result", url })) }],
              usage: { input_tokens: 8000, output_tokens: 20 },
            };
          const text = JSON.stringify({ images: verdicts.map((overrides, index) => verdict({ index, ...overrides })) });
          return { output: [{ type: "message", content: [{ type: "output_text", text }] }], usage: { input_tokens: 600, output_tokens: 90 } };
        },
      },
    },
  };
}

describe("image discovery service", () => {
  it("keeps an open-licence answer for every device and returns the picture once", async () => {
    const web: string[] = [];
    const openai = fakeOpenAi(["https://unsplash.com/photos/banana"], [{ brand: "not-visible", brandVisible: false }]);
    const service = createImageDiscovery(openai.client, { model: "m", maxConcurrent: 2 }, fakeWeb(web));
    const first = await service.discover(BANAAN);
    expect(first).toMatchObject({ ok: true, searchCalls: 1, discovery: { status: "found", candidates: [{ usageRightsStatus: "permitted", cors: true, sourceName: "Unsplash" }] } });
    expect(first.ok && first.selectedData?.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(web).toContain("https://images.unsplash.com/photo-9?w=640&q=80&fit=max&fm=jpg");
    const second = await service.discover({ name: " banaan ", generic: true });
    expect(second).toMatchObject({ ok: true, cached: true, searchCalls: 0 });
    expect(openai.bodies).toHaveLength(2);
  });

  it("never caches a picture with unclear rights for other devices", async () => {
    const openai = fakeOpenAi(["https://shop.example/terra"], [{}]);
    const service = createImageDiscovery(openai.client, { model: "m", maxConcurrent: 2 }, fakeWeb([]));
    expect(await service.discover(TERRA)).toMatchObject({ ok: true, discovery: { status: "personal" } });
    expect(service.cached(TERRA)).toBeNull();
    await service.discover(TERRA);
    expect(openai.bodies).toHaveLength(4);
  });

  it("shares one search between identical requests that arrive together", async () => {
    const openai = fakeOpenAi(["https://unsplash.com/photos/banana"], [{ brand: "not-visible", brandVisible: false }]);
    const service = createImageDiscovery(openai.client, { model: "m", maxConcurrent: 2 }, fakeWeb([]));
    const [a, b] = await Promise.all([service.discover(BANAAN), service.discover(BANAAN)]);
    expect(a.ok && b.ok).toBe(true);
    expect(b).toMatchObject({ cached: true, searchCalls: 0 });
    expect(openai.bodies).toHaveLength(2);
  });

  it("adds Openverse photos for generic products and shares the open-licence result", async () => {
    const web: string[] = [];
    const openai = fakeOpenAi([], [{ brand: "not-visible", brandVisible: false }], ["site:unsplash.com banana isolated"]);
    const openverse = async (url: string) => {
      web.push(url);
      if (url.startsWith("https://api.openverse.org/v1/images/?"))
        return Response.json({
          results: [{ title: "Bananas Fruits", foreign_landing_url: "https://stocksnap.io/photo/a", thumbnail: "https://api.openverse.org/v1/images/a/thumb/", license: "cc0", source: "stocksnap" }],
        });
      if (url === "https://api.openverse.org/v1/images/a/thumb/") return new Response(JPEG, { headers: { "content-type": "image/jpeg", "access-control-allow-origin": "*" } });
      return new Response("nope", { status: 404 });
    };
    const service = createImageDiscovery(openai.client, { model: "m", maxConcurrent: 2, openverse: true }, openverse);
    const result = await service.discover(BANAAN);
    expect(result).toMatchObject({ ok: true, discovery: { status: "found", candidates: [{ usageRightsStatus: "permitted", license: "CC0", sourceName: "Stocksnap" }] } });
    expect(new URL(web[0]).searchParams.get("q")).toBe("banana");
    expect(service.cached(BANAAN)?.status).toBe("found");
    await service.discover(TERRA);
    expect(web.filter((url) => url.includes("?q="))).toHaveLength(1);
  });

  it("uses Brave for branded packs, falls back to the thumbnail when the shop refuses, and keeps standard products on OpenAI", async () => {
    const web: string[] = [];
    const openai = fakeOpenAi(["https://unsplash.com/photos/banana"], [{}]);
    const brave = async (url: string, init?: RequestInit) => {
      web.push(url);
      if (url.startsWith("https://api.search.brave.com/")) {
        expect((init?.headers as Record<string, string>)["X-Subscription-Token"]).toBe("k");
        return Response.json({
          results: [{ title: "AH Terra", url: "https://www.ah.nl/producten/terra", thumbnail: { src: "https://imgs.search.brave.com/t" }, properties: { url: "https://static.ah.nl/terra.jpg" } }],
        });
      }
      if (url === "https://static.ah.nl/terra.jpg") return new Response("", { status: 403 });
      if (url === "https://imgs.search.brave.com/t") return new Response(JPEG, { headers: { "content-type": "image/jpeg" } });
      return fakeWeb([])(url);
    };
    const service = createImageDiscovery(openai.client, { model: "m", maxConcurrent: 2, braveKey: "k" }, brave);
    const terra = await service.searchProductReferenceImages(TERRA);
    expect(terra).toMatchObject({ ok: true, providerCalls: 1, searchCalls: 0, discovery: { status: "personal", provider: "brave", candidates: [{ imageUrl: "https://static.ah.nl/terra.jpg", sourceName: "ah.nl" }] } });
    expect(openai.bodies.filter((body) => body.tools)).toHaveLength(0);
    const banaan = await service.searchProductReferenceImages(BANAAN);
    expect(banaan).toMatchObject({ ok: true, providerCalls: 0, searchCalls: 1, discovery: { provider: "openai-web" } });
  });

  it("falls back to OpenAI web search when Brave refuses and records why", async () => {
    const openai = fakeOpenAi(["https://shop.example/terra"], [{}]);
    const web = fakeWeb([]);
    const fetchImpl = async (url: string) => (url.startsWith("https://api.search.brave.com/") ? new Response("", { status: 429 }) : web(url));
    const service = createImageDiscovery(openai.client, { model: "m", maxConcurrent: 2, braveKey: "k" }, fetchImpl);
    const result = await service.searchProductReferenceImages(TERRA);
    expect(result).toMatchObject({ ok: true, providerCalls: 1, searchCalls: 1, discovery: { status: "personal", provider: "openai-web" } });
    expect(result.failures).toContain("brave:rate-limited");
  });

  it("stores the facts from a branded pack's page once, checked against the page", async () => {
    const bodies: { text?: { format?: { name?: string } }; tools?: unknown }[] = [];
    const client = {
      responses: {
        create: async (body: never) => {
          const request = body as (typeof bodies)[number];
          bodies.push(request);
          if (request.tools) return { output: [{ type: "web_search_call", action: { type: "search" }, results: [{ type: "text_result", url: "https://shop.example/terra" }] }] };
          if (request.text?.format?.name === "product_facts")
            return { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(raw({ sugars: 9.9 })) }] }], usage: { input_tokens: 2500, output_tokens: 120 } };
          return { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ images: [verdict({ index: 0 })] }) }] }] };
        },
      },
    };
    const web = fakeWeb([]);
    const page = async (url: string) =>
      url === "https://shop.example/terra" ? new Response(`<meta property="og:image" content="https://shop.example/terra.jpg">${SHOP_PAGE}`, { headers: { "content-type": "text/html" } }) : web(url);
    const service = createImageDiscovery(client, { model: "m", maxConcurrent: 2 }, page);
    const first = await service.searchProductReferenceImages(TERRA);
    expect(first.ok && first.discovery.facts).toMatchObject({ nutriScore: "B", per100: { fat: 51.3 }, sourceName: "shop.example" });
    expect(first.ok && first.discovery.facts?.per100?.sugars).toBeUndefined();
    await service.searchProductReferenceImages(TERRA);
    expect(bodies.filter((body) => body.text?.format?.name === "product_facts")).toHaveLength(1);
    await service.searchProductReferenceImages(BANAAN);
    expect(bodies.filter((body) => body.text?.format?.name === "product_facts")).toHaveLength(1);

    bodies.length = 0;
    const typed = createImageDiscovery(client, { model: "m", maxConcurrent: 2 }, page);
    const pictureOnly = await typed.searchProductReferenceImages({ ...TERRA, typed: true });
    expect(pictureOnly).toMatchObject({ ok: true, discovery: { status: "personal" } });
    expect(pictureOnly.ok && pictureOnly.discovery.facts).toBeFalsy();
    expect(bodies.filter((body) => body.text?.format?.name === "product_facts")).toHaveLength(0);
  });

  it("treats an Openverse outage as one more failed source", async () => {
    const openai = fakeOpenAi([], [], ["site:unsplash.com banana isolated"]);
    const service = createImageDiscovery(openai.client, { model: "m", maxConcurrent: 2, openverse: true }, async () => new Response("", { status: 504 }));
    const result = await service.searchProductReferenceImages(BANAAN);
    expect(result).toMatchObject({ ok: true, discovery: { status: "none" }, failures: ["search:no-results", "openverse:unavailable"] });
  });

  it("does not follow a redirect to a private address", async () => {
    const web: string[] = [];
    const openai = fakeOpenAi(["https://shop.example/moved"], []);
    const service = createImageDiscovery(openai.client, { model: "m", maxConcurrent: 2 }, fakeWeb(web));
    const result = await service.searchProductReferenceImages(TERRA);
    expect(result).toMatchObject({ ok: true, discovery: { status: "none" } });
    expect(web).not.toContain("https://10.0.0.5/admin");
  });
});

describe("POST /api/images/discover", () => {
  let server: Server | null = null;
  const logs: Record<string, unknown>[] = [];

  afterEach(() => {
    server?.close();
    server = null;
    logs.length = 0;
  });

  async function start(discover: () => Promise<unknown>, cached: Discovery | null = null, busy = false) {
    const limits = createLimits({ perIpPerHour: 2, perIpPerDay: 5, dailyRequests: 10, dailyBudgetUsd: 1, inputUsdPerMTok: 1, cachedInputUsdPerMTok: 0.1, outputUsdPerMTok: 4 });
    const handler = createHandler({
      allowedOrigins: ["https://karrieapp.onrender.com"],
      requireOrigin: true,
      configured: true,
      model: "m",
      limits: createLimits({ perIpPerHour: 1, perIpPerDay: 1, dailyRequests: 1, dailyBudgetUsd: 1, inputUsdPerMTok: 1, cachedInputUsdPerMTok: 0.1, outputUsdPerMTok: 4 }),
      recognize: async () => ({ ok: false, code: "unavailable" }),
      images: {
        discovery: { provider: "openai-web", discover: discover as never, cached: () => cached, busy: () => busy },
        limits,
        searchCallUsd: 0.01,
        providerCallUsd: 0.005,
      },
      log: (entry) => logs.push(entry),
    });
    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    return {
      limits,
      post: (body: unknown) =>
        fetch(`http://127.0.0.1:${port}/api/images/discover`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://karrieapp.onrender.com" },
          body: JSON.stringify(body),
        }),
    };
  }

  const found: Discovery = { status: "found", selected: 0, candidates: [], provider: "openai-web", searchedAt: 1 };

  it("returns the discovery and the selected picture, counts search calls as cost and logs no image data", async () => {
    const selectedData = `data:image/jpeg;base64,${JPEG.toString("base64")}`;
    const { post, limits } = await start(async () => ({ ok: true, discovery: found, selectedData, usage: { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 100 }, searchCalls: 2, providerCalls: 0 }));
    const response = await post({ identity: TERRA });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", discovery: { status: "found" }, selectedData });
    expect(limits.stats().today.costUsd).toBeCloseTo(0.02 + 0.001 + 0.0004, 5);
    expect(JSON.stringify(logs)).not.toContain("base64");
  });

  it("answers from the cache without using the limits", async () => {
    const { post, limits } = await start(async () => ({ ok: false, code: "unavailable", searchCalls: 0, providerCalls: 0 }), found);
    for (let i = 0; i < 4; i += 1) expect((await post({ identity: BANAAN })).status).toBe(200);
    expect(limits.stats().today.requests).toBe(0);
  });

  it("rejects malformed identities, refuses when busy and rate limits new searches", async () => {
    const ok = async () => ({ ok: true, discovery: found, searchCalls: 1, providerCalls: 0 });
    const { post } = await start(ok);
    expect((await post({ identity: { name: "" , generic: true } })).status).toBe(400);
    expect((await post({ identity: { ...TERRA, extra: 1 } })).status).toBe(400);
    expect((await post({ identity: BANAAN, refresh: true })).status).toBe(200);
    expect((await post({ identity: BANAAN, refresh: true })).status).toBe(200);
    expect((await post({ identity: BANAAN, refresh: true })).status).toBe(429);
    server?.close();
    const busy = await start(ok, null, true);
    expect((await busy.post({ identity: BANAAN })).status).toBe(503);
  });
});
