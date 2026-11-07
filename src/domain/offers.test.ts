import { describe, expect, it } from "vitest";
import { parseAnswer } from "../services/offers/client";
import { mechanismText, offerQuery, shownAs, summaryText, validUntilText, type OfferRow } from "./offers";
import type { AdventureItem } from "./types";

const NOW = Date.parse("2026-11-07T10:00:00Z");

const item = (overrides: Partial<AdventureItem> = {}): AdventureItem => ({
  id: "1",
  productId: "banaan",
  name: "Banaan",
  icon: "banaan",
  category: "produce",
  quantity: 1,
  status: "pending",
  ...overrides,
});

const ARLA: OfferRow = {
  retailer: "albert_heijn",
  sourceProductId: "ah_wi168925_2026-11-02",
  productName: "Arla Biologisch halfvolle melk",
  quantity: "1 l",
  promotionStatus: "active",
  promotionalPrice: 1.5,
  originalPrice: 1.79,
  promotionMechanism: "multi_buy",
  promotionText: "2 voor 2.99",
  multiBuyQuantity: 2,
  multiBuyPrice: 2.99,
  validUntil: "2026-11-08",
};

describe("offerQuery", () => {
  it("1. asks for generic bananas by name with the catalog's other names", () => {
    expect(offerQuery(item(), "jumbo")).toEqual({
      key: "jumbo|g|banaan",
      retailer: "jumbo",
      product: { name: "Banaan", aliases: ["bananen", "banana"], category: "produce", generic: true },
    });
  });

  it("2. asks for a scanned pack by its barcode, brand and size", () => {
    const scanned = item({ productId: "photo:1", name: "Biologisch halfvolle melk", category: "dairy", source: "barcode", brand: "Arla", packageSize: "1 l", ean: "8718166011021" });
    expect(offerQuery(scanned, "albert_heijn")).toEqual({
      key: "albert_heijn|e|8718166011021",
      retailer: "albert_heijn",
      product: { name: "Biologisch halfvolle melk", category: "dairy", generic: false, brand: "Arla", size: "1 l", ean: "8718166011021" },
    });
  });

  it("3. a recognised branded pack without a barcode is asked by brand", () => {
    const seen = item({ productId: "photo:2", name: "Pindakaas", category: "pantry", source: "vision", brand: "Calvé", recognition: { specific: true, confidence: "high" } });
    expect(offerQuery(seen, "jumbo")?.product).toEqual({ name: "Pindakaas", category: "pantry", generic: false, brand: "Calvé" });
    expect(offerQuery(seen, "jumbo")?.key).toBe("jumbo|p|calve|pindakaas||");
  });

  it("drops a barcode that is not valid", () => {
    expect(offerQuery(item({ ean: "1234567890123", source: "barcode", brand: "X" }), "lidl")?.product).not.toHaveProperty("ean");
  });
});

describe("how an offer reads", () => {
  it("11. multi-buy shows its own terms and the normal price, never a computed saving", () => {
    expect(mechanismText(ARLA)).toEqual({ headline: "2 voor €2,99", price: "Normaal €1,79", conditions: [] });
  });

  it("a plain discount shows the new and old price", () => {
    expect(mechanismText({ ...ARLA, promotionMechanism: "percentage", promotionText: undefined, multiBuyQuantity: undefined })).toEqual({
      headline: "Aanbieding",
      price: "€1,50, was €1,79",
      conditions: [],
    });
  });

  it("lists the conditions", () => {
    const strict = { ...ARLA, loyaltyPrice: 1.25, loyaltyProgram: "Bonuskaart", onlineOnly: true, maxPerCustomer: 4 };
    expect(mechanismText(strict).conditions).toEqual(["€1,25 met Bonuskaart", "Alleen online", "Maximaal 4 per klant"]);
  });

  it("says until when, in Dutch", () => {
    expect(validUntilText(ARLA)).toBe("t/m zondag 8 november");
    expect(validUntilText({ validUntil: "2026-11-08", validUntilEstimated: true })).toBe("t/m zondag 8 november (verwacht)");
    expect(validUntilText({})).toBeUndefined();
  });

  it("counts in the summary line", () => {
    expect(summaryText(2, "jumbo")).toBe("2 producten in de aanbieding bij Jumbo");
    expect(summaryText(1, "albert_heijn")).toBe("1 product in de aanbieding bij Albert Heijn");
  });
});

describe("answers from the server", () => {
  const body = (match: unknown) => ({ status: "ok", match, fetchedAt: "2026-11-07T10:00:00.000Z" });

  it("keeps an exact match and drops unsafe links", () => {
    const answer = parseAnswer(body({ matchType: "exact", matchConfidence: "high", offer: { ...ARLA, sourceUrl: "http://example.com" } }), NOW);
    expect(answer?.offer).toMatchObject({ productName: "Arla Biologisch halfvolle melk", matchType: "exact" });
    expect(answer?.offer).not.toHaveProperty("sourceUrl");
    expect(shownAs(answer!, NOW)).toBe("deal");
  });

  it("13. a likely match of medium confidence is only 'maybe', and a broken offer is unknown", () => {
    const maybe = parseAnswer(body({ matchType: "likely", matchConfidence: "medium", offer: ARLA }), NOW);
    expect(shownAs(maybe!, NOW)).toBe("maybe");
    expect(parseAnswer(body({ matchType: "likely", offer: { productName: "x" } }), NOW)?.matchType).toBe("unknown");
    expect(parseAnswer(body({ matchType: "great" }), NOW)).toBeNull();
    expect(parseAnswer(body({ matchType: "none" }), NOW)).toEqual({ matchType: "none", fetchedAt: "2026-11-07T10:00:00.000Z" });
  });

  it("10. an expired promotion shows nothing", () => {
    const answer = parseAnswer(body({ matchType: "exact", matchConfidence: "high", offer: { ...ARLA, validUntil: "2026-11-06" } }), NOW);
    expect(shownAs(answer!, NOW)).toBeNull();
  });
});
