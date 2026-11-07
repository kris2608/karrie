import { describe, expect, it } from "vitest";
import { classify, isRunning, parseSize, sameSize, stem, type OfferProduct } from "./match.js";
import { parseSearch, type OfferRow } from "./prijsprofeet.js";

/** Rows as PrijsProfeet's /search returned them in November 2026, trimmed to the fields Karrie reads. */
const RAW = {
  babyBananen: {
    product_id: "jumbo_576969ZK",
    name: "Ella's Kitchen Baby bananen ontbijtje 6+ biologisch 100 g",
    brand: "Ella's Kitchen",
    ean: "5060107335240",
    unified_category: "groente-fruit",
    quantity: "100 g",
    price: 1.42,
    original_price: 1.89,
    retailer: "jumbo",
    promotion_status: "active",
    promotion_type: "one_plus_one",
    multi_buy_quantity: 4,
    multi_buy_price: 5.67,
    valid_from: "2026-11-04",
    valid_until: "2026-11-10",
    product_url: "https://www.jumbo.com/producten/ella-s-kitchen-baby-bananen-ontbijtje-576969ZK",
  },
  arla: {
    product_id: "ah_wi168925_2026-11-02",
    name: "Arla Biologisch halfvolle melk",
    brand: "Arla",
    ean: "8718166011021",
    private_label: false,
    unified_category: "zuivel-eieren",
    quantity: "1 l",
    price: 1.5,
    original_price: 1.79,
    unit_price: 1.5,
    unit: "L",
    retailer: "albert_heijn",
    promotion_status: "active",
    promotion_type: "multi_buy",
    promotional_keywords: ["2 voor 2.99", "2 VOOR 2.99"],
    multi_buy_quantity: 2,
    multi_buy_price: 2.99,
    valid_until: "2026-11-08",
    product_url: "https://www.ah.nl/producten/product/wi168925/arla-biologisch-halfvolle-melk",
  },
  palmolive: {
    product_id: "ah_wi56949",
    name: "Palmolive Naturals melk & amandel",
    brand: "Palmolive",
    unified_category: "huidverzorging",
    retailer: "albert_heijn",
    promotion_status: "active",
    promotion_type: "one_plus_one",
    promotional_keywords: ["2e gratis"],
  },
  hagel: {
    product_id: "ah_hagel",
    name: "De Ruijter Chocoladehagel melk",
    brand: "De Ruijter",
    unified_category: "ontbijt",
    retailer: "albert_heijn",
    promotion_status: "active",
  },
  popcorn: {
    product_id: "ah_popcorn",
    name: "Galler Melk popcorn",
    brand: "Galler",
    unified_category: "snoep-koek-chips",
    retailer: "albert_heijn",
    promotion_status: "active",
  },
  groentesap: {
    product_id: "ah_groentesap",
    name: "AH 80% Groentesap komkommer spinazie",
    brand: "AH",
    private_label: true,
    unified_category: "groente-fruit",
    retailer: "albert_heijn",
    promotion_status: "active",
  },
  rauwkost: {
    product_id: "ah_rauwkost",
    name: "AH Rauwkost komkommer",
    brand: "AH",
    ean: "8718265141643",
    private_label: true,
    unified_category: "groente-fruit",
    quantity: "150 g",
    retailer: "albert_heijn",
    promotion_status: "active",
    promotion_type: "multi_buy",
  },
  dove: {
    product_id: "ah_dove",
    name: "Dove Anti-transpirant roller komkommer",
    brand: "Dove",
    unified_category: "deodorant",
    retailer: "albert_heijn",
    promotion_status: "active",
  },
  /** Not a real listing: a loose house-brand product to show what a confident generic match looks like. */
  jumboBananen: {
    product_id: "jumbo_test_bananen",
    name: "Jumbo Bananen",
    brand: "Jumbo",
    private_label: true,
    unified_category: "groente-fruit",
    quantity: "1 kg",
    price: 1.49,
    original_price: 1.99,
    retailer: "jumbo",
    promotion_status: "active",
    promotion_type: "percentage",
    valid_from: "2026-11-04",
    valid_until: "2026-11-10",
  },
};

function rows(...raw: object[]): OfferRow[] {
  return parseSearch({ results: raw }) ?? [];
}

const NOW = Date.parse("2026-11-07T10:00:00Z");
const banaan: OfferProduct = { name: "Banaan", aliases: ["bananen", "banana"], category: "produce", generic: true };
const melk: OfferProduct = { name: "Melk", aliases: ["melkpak", "halfvolle melk"], category: "dairy", generic: true };
const komkommer: OfferProduct = { name: "Komkommer", aliases: ["komkommers"], category: "produce", generic: true };
const arla: OfferProduct = { name: "Biologisch halfvolle melk", brand: "Arla", size: "1 l", category: "dairy", generic: false };

describe("parseSearch", () => {
  it("keeps the fields Karrie shows and skips rows that do not fit", () => {
    const [row] = rows(RAW.arla, { name: "no id" });
    expect(row).toMatchObject({
      retailer: "albert_heijn",
      sourceProductId: "ah_wi168925_2026-11-02",
      productName: "Arla Biologisch halfvolle melk",
      ean: "8718166011021",
      promotionalPrice: 1.5,
      originalPrice: 1.79,
      promotionMechanism: "multi_buy",
      promotionText: "2 voor 2.99",
      multiBuyQuantity: 2,
      multiBuyPrice: 2.99,
      validUntil: "2026-11-08",
      sourceUrl: "https://www.ah.nl/producten/product/wi168925/arla-biologisch-halfvolle-melk",
    });
    expect(rows(RAW.arla, { name: "no id" })).toHaveLength(1);
    expect(parseSearch({ nope: true })).toBeNull();
  });

  it("drops links that are not https", () => {
    const [row] = rows({ ...RAW.arla, product_url: "javascript:alert(1)" });
    expect(row.sourceUrl).toBeUndefined();
  });
});

describe("words and sizes", () => {
  it("folds Dutch plurals together", () => {
    expect(stem("bananen")).toBe(stem("banaan"));
    expect(stem("tomaten")).toBe(stem("tomaat"));
    expect(stem("komkommers")).toBe(stem("komkommer"));
    expect(stem("uien")).toBe(stem("ui"));
  });

  it("reads and compares pack sizes", () => {
    expect(parseSize("1,5 l")).toEqual({ unit: "ml", amount: 1500 });
    expect(parseSize("6 x 330 ml")).toEqual({ unit: "ml", amount: 1980 });
    expect(sameSize("1 l", "1000 ml")).toBe(true);
    expect(sameSize("1 l", "1,5 l")).toBe(false);
    expect(sameSize("1 l", undefined)).toBeUndefined();
  });
});

describe("classify", () => {
  it("1. never takes baby food for loose bananas (Jumbo)", () => {
    expect(classify(banaan, rows(RAW.babyBananen), NOW)).toEqual({ matchType: "none" });
  });

  it("1. matches loose house-brand bananas confidently", () => {
    const match = classify(banaan, rows(RAW.babyBananen, RAW.jumboBananen), NOW);
    expect(match).toMatchObject({ matchType: "likely", matchConfidence: "high", offer: { productName: "Jumbo Bananen" } });
  });

  it("2. a verified EAN is exact; a conflicting size makes it only likely", () => {
    const byEan = { ...arla, ean: "8718166011021" };
    expect(classify(byEan, rows(RAW.arla), NOW)).toMatchObject({ matchType: "exact", matchConfidence: "high" });
    expect(classify({ ...byEan, size: "1,5 l" }, rows(RAW.arla), NOW)).toMatchObject({ matchType: "likely", matchConfidence: "medium" });
  });

  it("3. a branded product needs the same brand and name; the size decides the confidence", () => {
    expect(classify(arla, rows(RAW.arla), NOW)).toMatchObject({ matchType: "likely", matchConfidence: "high" });
    expect(classify({ ...arla, size: "500 ml" }, rows(RAW.arla), NOW)).toMatchObject({ matchType: "likely", matchConfidence: "medium" });
    expect(classify({ ...arla, size: undefined }, rows(RAW.arla), NOW)).toMatchObject({ matchConfidence: "medium" });
    expect(classify({ ...arla, brand: "Campina" }, rows(RAW.arla), NOW)).toEqual({ matchType: "none" });
    expect(classify({ ...arla, name: "Biologisch volle melk" }, rows(RAW.arla), NOW)).toEqual({ matchType: "none" });
  });

  it("4. no current promotion is none", () => {
    expect(classify(melk, [], NOW)).toEqual({ matchType: "none" });
  });

  it("13. generic milk against a national brand is at most a possible match", () => {
    const match = classify(melk, rows(RAW.palmolive, RAW.hagel, RAW.popcorn, RAW.arla), NOW);
    expect(match).toMatchObject({ matchType: "likely", matchConfidence: "medium", offer: { productName: "Arla Biologisch halfvolle melk" } });
  });

  it("13. shower gel, chocolate sprinkles and popcorn are never milk", () => {
    expect(classify(melk, rows(RAW.palmolive, RAW.hagel, RAW.popcorn), NOW)).toEqual({ matchType: "none" });
  });

  it("13. white cheese is a different product than cheese", () => {
    const kaas: OfferProduct = { name: "Kaas", aliases: ["jong belegen kaas"], category: "dairy", generic: true };
    const witte = { product_id: "ah_witte_kaas", name: "Sütdiyari Witte kaas 40+", brand: "Sütdiyari", unified_category: "kaas", retailer: "albert_heijn", promotion_status: "active" };
    expect(classify(kaas, rows(witte), NOW)).toEqual({ matchType: "none" });
  });

  it("13. juice, salads and deodorant are never a cucumber", () => {
    expect(classify(komkommer, rows(RAW.groentesap, RAW.rauwkost, RAW.dove), NOW)).toEqual({ matchType: "none" });
  });

  it("10. expired, upcoming and not-yet-started promotions are discarded", () => {
    expect(classify(arla, rows({ ...RAW.arla, valid_until: "2026-11-06" }), NOW)).toEqual({ matchType: "none" });
    expect(classify(arla, rows({ ...RAW.arla, promotion_status: "upcoming" }), NOW)).toEqual({ matchType: "none" });
    expect(classify(arla, rows({ ...RAW.arla, valid_from: "2026-11-09" }), NOW)).toEqual({ matchType: "none" });
  });

  it("10. a promotion runs until the end of its last day in the Netherlands", () => {
    const [row] = rows({ ...RAW.arla, valid_until: "2026-11-07" });
    expect(isRunning(row, Date.parse("2026-11-07T22:30:00Z"))).toBe(true);
    expect(isRunning(row, Date.parse("2026-11-07T23:30:00Z"))).toBe(false);
  });

  it("prefers an exact match over a likely one", () => {
    const byEan: OfferProduct = { name: "Rauwkost komkommer", brand: "AH", ean: "8718265141643", category: "produce", generic: false };
    expect(classify(byEan, rows(RAW.groentesap, RAW.rauwkost), NOW)).toMatchObject({ matchType: "exact", offer: { sourceProductId: "ah_rauwkost" } });
  });
});
