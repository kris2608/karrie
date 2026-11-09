import { describe, expect, it } from "vitest";
import { createNameImageLookup, fromOffer, nameKey } from "./nameImage.js";
import { matchName, rowSize, type NameRow } from "./nameMatch.js";
import type { OfferRow, SearchResult } from "./offers/prijsprofeet.js";
import type { OffSearchResult } from "./offSearch.js";
import { createOffSearch, OFF_SEARCH_RULES, parseOffSearch } from "./offSearch.js";

const AH = "https://static.ah.nl/dam/product/";
const JUMBO = "https://www.jumbo.com/dam-images/";

function pp(name: string, quantity: string, retailer: OfferRow["retailer"] = "albert_heijn", brand = "Chocomel", image = true, category = "zuivel-eieren"): NameRow {
  const host = retailer === "jumbo" ? JUMBO : AH;
  return {
    source: "prijsprofeet",
    retailer,
    name,
    brands: [brand],
    quantity,
    category,
    ...(image && { imageUrl: `${host}${encodeURIComponent(name)}.jpg` }),
    sourceUrl: `https://example.test/${encodeURIComponent(name)}`,
    ean: "8712345678906",
  };
}

/** Shaped like PrijsProfeet's real answer for "chocomel" in November 2026. */
const CHOCOMEL: NameRow[] = [
  pp("Chocomel Vol blik 4 x 6 x 250ML", "4 x 6 x 250 ml", "jumbo"),
  pp("Chocomel Vol 0% suiker toegevoegd", "1 l"),
  pp("Chocomel Halfvol", "1 l"),
  pp("Chocomel Lactosevrij", "1 l"),
  pp("Chocomel dark", "1 l"),
  pp("Chocomel Plant-based", "1 l"),
  pp("Chocomel Protein 12x300ML", "12 x 300 ml", "jumbo"),
  pp("Chocomel Vol Voordeel 8 x 1,5 L", "8 x 1,5 l", "jumbo"),
  pp("Chocomel Vol 6 x 200 ml", "6 x 200 ml"),
  pp("Chocomel Vol", "1 l"),
  pp("Chocomel Vol UTZ-MB 24x200ml", "24 x 200 ml", "jumbo"),
];

describe("matchName", () => {
  it("Chocomel: the regular 1 l pack, never zero sugar or plant-based", () => {
    const result = matchName("Chocomel", CHOCOMEL);
    expect(result).toMatchObject({ classification: "branded", brand: "Chocomel", match: { productName: "Chocomel Vol", retailer: "albert_heijn", confidence: "high" }, category: "dairy" });
    expect(result.variant).toBeUndefined();
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(result.alternatives.length).toBeLessThanOrEqual(6);
    expect(result.alternatives.every((image) => image.confidence === "medium")).toBe(true);
  });

  it("Chocomel blik: a can, or nothing when no can has a photo", () => {
    expect(matchName("Chocomel blik", CHOCOMEL).match?.productName).toBe("Chocomel Vol blik 4 x 6 x 250ML");
    const noCan = CHOCOMEL.filter((row) => !row.name.includes("blik"));
    expect(matchName("Chocomel blik", noCan).match).toBeNull();
    expect(matchName("Chocomel blik", noCan).classification).toBe("branded");
  });

  it("Chocomel 1 liter: the 1 l pack, and no photo for a size nobody sells", () => {
    expect(matchName("Chocomel 1 liter", CHOCOMEL).match?.productName).toBe("Chocomel Vol");
    expect(matchName("Chocomel 6 x 200 ml", CHOCOMEL).match?.productName).toBe("Chocomel Vol 6 x 200 ml");
    expect(matchName("Chocomel 330 ml", CHOCOMEL).match).toBeNull();
  });

  it("Chocomel 0% suiker: only the zero sugar pack, never regular Chocomel", () => {
    const zero = matchName("Chocomel 0% suiker", CHOCOMEL);
    expect(zero.match?.productName).toBe("Chocomel Vol 0% suiker toegevoegd");
    expect(zero.variant).toBe("0% suiker");
    const withoutZero = CHOCOMEL.filter((row) => !row.name.includes("0%"));
    expect(matchName("Chocomel 0% suiker", withoutZero).match).toBeNull();
    expect(matchName("Chocomel halfvol", CHOCOMEL).match?.productName).toBe("Chocomel Halfvol");
  });

  it("Nutella never gets another brand's spread", () => {
    const spreads = [pp("AH Hazelnootpasta", "400 g", "albert_heijn", "AH", true, "ontbijt"), pp("Jumbo Hazelnoot chocoladepasta", "400 g", "jumbo", "Jumbo")];
    expect(matchName("Nutella", spreads)).toEqual({ classification: "unknown", match: null, alternatives: [] });
    const withNutella = [...spreads, { ...pp("Nutella", "400 g", "jumbo", "Nutella"), category: "ontbijt" }];
    expect(matchName("Nutella", withNutella)).toMatchObject({ brand: "Nutella", match: { productName: "Nutella" }, category: "breakfast" });
    expect(matchName("Nutella", withNutella).alternatives.every((image) => image.productName === "Nutella" || image.brand === "Nutella")).toBe(true);
  });

  it("Optimel has only flavours, so it is branded without an automatic photo", () => {
    const optimel = ["Optimel kwark vanille", "Optimel drinkyoghurt aardbei", "Optimel vla vanille"].map((name) => pp(name, "500 g", "albert_heijn", "Optimel"));
    expect(matchName("Optimel", optimel)).toMatchObject({ classification: "branded", brand: "Optimel", match: null });
    expect(matchName("Optimel", optimel).alternatives).toHaveLength(3);
  });

  it("a plain product type is not a brand, even when a house brand sells it", () => {
    const nuts = [pp("AH Walnoten", "200 g", "albert_heijn", "AH"), pp("Jumbo Ongebrande Walnoten", "150 g", "jumbo", "Jumbo")];
    expect(matchName("walnoten", nuts).classification).toBe("unknown");
    expect(matchName("AH walnoten", nuts)).toMatchObject({ classification: "branded", brand: "AH", match: { productName: "AH Walnoten" } });
  });

  it("a product type that one Open Food Facts row lists as its brand stays a product type", () => {
    const off = (name: string, brands: string) => ({ source: "off" as const, name, brands: [brands], quantity: "200 gram", imageUrl: `https://images.openfoodfacts.org/images/products/${encodeURIComponent(name)}.jpg` });
    const cashews = [off("Cashewnoten par.kaas", "Cashewnoten"), off("Cashewnoten (gebrand gezout)", "Lidl"), off("Cashewnoten ongezouten", "Jumbo"), off("Cashewnoten ongebrand en ongezouten", "AH")];
    expect(matchName("cashewnoten", cashews)).toEqual({ classification: "unknown", match: null, alternatives: [] });
    const chocomel = [off("Chocomel Vol", "Chocomel"), off("Chocomel Light", "Chocomel"), off("Chocomel", "Nutricia")];
    expect(matchName("Chocomel", chocomel)).toMatchObject({ classification: "branded", brand: "Chocomel" });
  });

  it("finds Calvé in Open Food Facts rows and skips the pieces and 100% variants", () => {
    const rows = parseOffSearch({
      products: [
        { code: "8712566000014", product_name: "Pindakaas met stukjes pinda", brands: "Calvé", quantity: "650 gram", image_front_url: "https://images.openfoodfacts.org/images/products/1.jpg" },
        { code: "8712566000015", product_name: "100% Pindakaas", brands: "Calvé", quantity: "350 gram", image_front_url: "https://images.openfoodfacts.org/images/products/2.jpg" },
        { code: "8712566000016", product_name: "CALVÉ pindakaas", brands: "CALVÉ", quantity: "350 gram", image_front_url: "https://images.openfoodfacts.org/images/products/3.jpg" },
        { code: "8712566000017", product_name: "Pindakaas", brands: "Calvé", quantity: "1000 gram", image_front_url: "https://evil.example/4.jpg" },
      ],
    })!;
    expect(rows[3].imageUrl).toBeUndefined();
    const result = matchName("Calvé pindakaas", rows);
    expect(result).toMatchObject({ classification: "branded", brand: "Calvé", variant: "pindakaas", match: { source: "off", productName: "CALVÉ pindakaas" } });
    expect(matchName("Calvé pindakaas 650 g", rows).match).toBeNull();
  });

  it("live Open Food Facts shapes: a mistagged brand does not swallow the product, a plain brand gets no flavour", () => {
    const off = (name: string, brands: string, quantity = "350 gram") => ({ source: "off" as const, name, brands: brands.split("|"), quantity, imageUrl: `https://images.openfoodfacts.org/images/products/${encodeURIComponent(name)}.jpg` });
    const calve = [off("CALVÉ pindakaas", "CALVÉ"), off("Pindakaas stukjes pinda", "Calvé"), off("100% Pindakaas", "Calvé"), off("Pindakaas", "Calve", "650 gram"), off("Karamel zeezout reep", "Calvé Pindakaas"), off("Mayonaise", "Calvé")];
    const result = matchName("Calvé pindakaas", calve);
    expect(result).toMatchObject({ brand: "Calvé", variant: "pindakaas", match: { productName: "Pindakaas" } });
    expect([result.match, ...result.alternatives].map((image) => image!.productName)).not.toEqual(expect.arrayContaining(["Karamel zeezout reep", "Mayonaise"]));

    const optimel = [off("Drinkyogurt", "Optimel", "1000 ml"), off("Drinkyoghurt Aardbei", "Optimel", "1000 ml"), off("Optimel Vla Vanille", "Optimel", "1000 ml"), off("Framboos granaatappel", "Optimel Protein", "1500 ml")];
    expect(matchName("Optimel", optimel)).toMatchObject({ classification: "branded", brand: "Optimel", match: null });

    const terra = [pp("AH Terra Pindakaas", "350 g", "albert_heijn", "AH Terra"), pp("AH Terra Hummus", "200 g", "albert_heijn", "AH Terra"), pp("AH Pindakaas", "350 g", "albert_heijn", "AH"), pp("AH Hummus", "200 g", "albert_heijn", "AH"), pp("AH Pesto", "190 g", "albert_heijn", "AH")];
    expect(matchName("AH Terra pindakaas", terra)).toMatchObject({ brand: "AH Terra", variant: "pindakaas", match: { productName: "AH Terra Pindakaas" } });
  });

  it("reads sizes from the quantity or the name", () => {
    expect(rowSize({ name: "Chocomel Vol", quantity: "1 l" })).toEqual({ unit: "ml", amount: 1000 });
    expect(rowSize({ name: "Chocomel Protein 12x300ML" })).toEqual({ unit: "ml", amount: 300, count: 12 });
    expect(rowSize({ name: "x", quantity: "4 x 6 x 250 ml" })).toEqual({ unit: "ml", amount: 250, count: 6 });
  });

  it("gives the same answer for the same rows in any order", () => {
    const reversed = [...CHOCOMEL].reverse();
    expect(matchName("Chocomel", reversed)).toEqual(matchName("Chocomel", CHOCOMEL));
  });
});

const offer = (row: NameRow): OfferRow => ({
  retailer: row.retailer!,
  sourceProductId: row.name,
  productName: row.name,
  brand: row.brands[0],
  quantity: row.quantity,
  imageUrl: row.imageUrl,
  sourceUrl: row.sourceUrl,
  category: row.category,
  promotionStatus: "active",
});

describe("name image lookup", () => {
  function setup(ppAnswer: SearchResult | ((q: string) => SearchResult), offAnswer: OffSearchResult = { ok: true, rows: [] }) {
    const calls = { pp: [] as string[], off: [] as string[] };
    let time = 0;
    const lookup = createNameImageLookup(
      {
        prijsProfeet: { searchName: async (q) => (calls.pp.push(q), typeof ppAnswer === "function" ? ppAnswer(q) : ppAnswer) },
        off: { search: async (q) => (calls.off.push(q), offAnswer) },
      },
      () => time,
    );
    return { lookup, calls, advance: (ms: number) => (time += ms) };
  }

  it("uses PrijsProfeet first and skips Open Food Facts after a reliable match", async () => {
    const { lookup, calls } = setup({ ok: true, rows: CHOCOMEL.map(offer) });
    const result = await lookup.find("Chocomel");
    expect(result).toMatchObject({ ok: true, answer: { classification: "branded", match: { source: "prijsprofeet" }, searched: { prijsprofeet: "match", off: "skipped" } } });
    expect(calls).toEqual({ pp: ["chocomel"], off: [] });
  });

  it("asks Open Food Facts when PrijsProfeet has no reliable photo", async () => {
    const off: OffSearchResult = { ok: true, rows: [{ source: "off", name: "Nutella", brands: ["Nutella", "Ferrero"], quantity: "400 g", imageUrl: "https://images.openfoodfacts.org/images/products/n.jpg" }] };
    const { lookup, calls } = setup({ ok: true, rows: [] }, off);
    const result = await lookup.find("Nutella");
    expect(result).toMatchObject({ ok: true, answer: { brand: "Nutella", match: { source: "off" }, searched: { prijsprofeet: "none", off: "match" } } });
    expect(calls.off).toEqual(["nutella"]);
  });

  it("tries the brand word alone when the whole name finds no brand", async () => {
    const calvé = { ...pp("Calvé Pindakaas", "350 g", "albert_heijn", "Calvé"), category: "ontbijt" };
    const { lookup, calls } = setup((q) => ({ ok: true, rows: q === "calve" ? [offer(calvé)] : [offer(pp("Flower Farm pinda's", "200 g", "albert_heijn", "Flower Farm"))] }));
    const result = await lookup.find("Calvé pindakaas");
    expect(calls.pp).toEqual(["calve pindakaas", "calve"]);
    expect(result).toMatchObject({ ok: true, answer: { match: { productName: "Calvé Pindakaas" } } });
  });

  it("an Open Food Facts outage is a short-lived error, not an unknown product", async () => {
    const { lookup, advance } = setup({ ok: true, rows: [] }, { ok: false, code: "unavailable" });
    expect(await lookup.find("Nutella")).toEqual({ ok: false, code: "unavailable" });
    expect(lookup.cached("Nutella")).toEqual({ ok: false, code: "unavailable" });
    advance(6 * 60 * 1000);
    expect(lookup.cached("Nutella")).toBeNull();

    const paused = setup({ ok: true, rows: [] }, { ok: false, code: "limit" });
    expect(await paused.lookup.find("walnoten")).toEqual({ ok: false, code: "unavailable" });
    expect(paused.lookup.cached("walnoten")).toBeNull();
  });

  it("asks once for the same name, also while the first search is running", async () => {
    const { lookup, calls } = setup({ ok: true, rows: CHOCOMEL.map(offer) });
    await Promise.all([lookup.find("Chocomel"), lookup.find("chocomel"), lookup.find("Chocomél")]);
    expect((await lookup.find("CHOCOMEL")).ok && (await lookup.find("CHOCOMEL") as { cached: boolean }).cached).toBe(true);
    expect(calls.pp).toHaveLength(1);
    expect(nameKey("Chocomel blik")).not.toBe(nameKey("Chocomel"));
  });

  it("never passes PrijsProfeet's rate limit on as a cached answer", async () => {
    const { lookup } = setup({ ok: false, code: "limit" });
    expect(await lookup.find("Chocomel")).toEqual({ ok: false, code: "limit" });
    expect(lookup.cached("Chocomel")).toBeNull();
  });

  it("Open Food Facts: one retry after a 503, a pause after two, and at most a few searches a minute", async () => {
    const urls: string[] = [];
    const replies = [503, 200, 503, 503];
    let time = 0;
    const off = createOffSearch(
      { userAgent: "Karrie/1.0 (https://karrie.eu)", retryMs: 0 },
      async (url) => {
        urls.push(url);
        const status = replies.shift() ?? 200;
        return status === 200 ? Response.json({ products: [{ code: "8000500310427", product_name: "Nutella", brands: "Nutella,Ferrero", image_front_url: "https://images.openfoodfacts.org/images/products/n.jpg" }] }) : new Response("busy", { status });
      },
      () => time,
    );
    expect(await off.search("nutella")).toMatchObject({ ok: true, rows: [{ name: "Nutella", brands: ["Nutella", "Ferrero"] }] });
    expect(new URL(urls[0]).searchParams.get("search_terms")).toBe("nutella");
    expect(new URL(urls[0]).searchParams.get("countries_tags_en")).toBe("netherlands");
    expect(await off.search("optimel")).toEqual({ ok: false, code: "unavailable" });
    expect(await off.search("calve")).toEqual({ ok: false, code: "limit" });
    expect(urls).toHaveLength(4);
    time += Math.max(OFF_SEARCH_RULES.pauseMs, 60_000) + 1;
    for (let index = 0; index < OFF_SEARCH_RULES.perMinute; index += 1) await off.search(`q${index}`);
    expect(await off.search("again")).toEqual({ ok: false, code: "limit" });
    expect(off.stats()).toMatchObject({ failures: 1 });
  });

  it("maps offer rows without inventing fields", () => {
    expect(fromOffer({ retailer: "lidl", sourceProductId: "1", productName: "Melk", promotionStatus: "active" })).toEqual({
      source: "prijsprofeet",
      retailer: "lidl",
      name: "Melk",
      brands: [],
      promotionStatus: "active",
    });
    expect(fromOffer({ retailer: "albert_heijn", sourceProductId: "2", productName: "AH Hagelslag", brand: "AH", promotionStatus: "unknown", privateLabel: true })).toMatchObject({
      privateLabel: true,
      retailer: "albert_heijn",
    });
  });
});
