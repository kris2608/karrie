import { describe, expect, it, vi } from "vitest";
import {
  enrichCandidates,
  identityConsistent,
  identityQueries,
  identityQuery,
  identityScore,
  primaryProduct,
  stripSizeTokens,
} from "./recognizeIdentity.js";
import type { RecognizedProduct, VisualCandidate } from "./schema.js";

const base: VisualCandidate = {
  observedCandidateId: "c1",
  productName: "Milbona Goudse oud",
  genericName: "kaas",
  catalogType: "kaas",
  specificProduct: true,
  brand: "Milbona",
  variant: "oud",
  packageSize: "450 g",
  category: "koeling",
  subcategory: "kaas",
  ean: null,
  inferredFields: [],
  confidence: "high",
};

const product: RecognizedProduct = {
  recognized: true,
  productName: "Milbona Goudse oud",
  genericName: "kaas",
  catalogType: "kaas",
  specificProduct: true,
  brand: "Milbona",
  variant: "oud",
  packageSize: "450 g",
  category: "koeling",
  subcategory: "kaas",
  ean: null,
  visibleNutriScore: null,
  visibleClaims: [],
  visibleIngredients: null,
  inferredFields: [],
  confidence: "high",
  needsConfirmation: false,
  containsPeople: false,
  alternative: {
    status: "none",
    evidence: "none",
    criteria: [],
    alternativeType: null,
    targetType: null,
    reason: null,
    parentExplanation: null,
    childPrompt: null,
  },
};

describe("identityQuery", () => {
  it("builds brand + discriminating title without stuffing package size into the search string", () => {
    expect(identityQuery(base)).toBe("Milbona Goudse oud");
    expect(identityQuery({ ...base, productName: "Milbona Goudse oud 450 g", packageSize: "450 g" })).toBe("Milbona Goudse oud");
    expect(stripSizeTokens("Magnum mini Double 6 x 55 ml")).toBe("Magnum mini Double");
  });

  it("offers progressive queries from exact to broader brand+type", () => {
    const magnum: VisualCandidate = {
      ...base,
      brand: "Magnum",
      productName: "Magnum mini Double Caramel Almond",
      genericName: "ijs",
      catalogType: "ijs",
      variant: "Caramel Almond",
      packageSize: "6 stuks",
    };
    const queries = identityQueries(magnum);
    expect(queries[0]).toMatch(/Magnum/i);
    expect(queries[0]).not.toMatch(/6/);
    expect(queries.some((query) => /ijs/i.test(query))).toBe(true);
  });
});

describe("identityConsistent", () => {
  it("rejects grated cheese when vision showed a block, mismatched brands/sizes, and never treats a fuzzy hit as EAN proof", () => {
    expect(identityConsistent(base, { productName: "Milbona Geraspte kaas jong", brand: "Milbona" })).toBe(false);
    expect(identityConsistent({ ...base, variant: "geraspt", productName: "Milbona geraspte kaas" }, { productName: "Milbona kaas blok oud", brand: "Milbona" })).toBe(
      false,
    );
    expect(identityConsistent(base, { productName: "Milbona Goudse oud", brand: "Milbona", packaging: "300 g" })).toBe(false);
    expect(identityConsistent(base, { productName: "AH Goudse oud", brand: "Albert Heijn" })).toBe(false);
    expect(identityConsistent(base, { productName: "Milbona Goudse oud 48+", brand: "Milbona", packaging: "450 g" })).toBe(true);
  });

  it("rejects conflicting flavours and multipack counts", () => {
    expect(
      identityConsistent(
        { ...base, brand: "Magnum", productName: "Magnum mini Classic", variant: "Classic", packageSize: "6 stuks" },
        { productName: "Magnum Mini Almond", brand: "Magnum", packaging: "6 x 55 ml" },
      ),
    ).toBe(false);
    expect(
      identityConsistent(
        { ...base, brand: "Magnum", productName: "Magnum mini", packageSize: "6 stuks" },
        { productName: "Magnum Mini Classic", brand: "Magnum", packaging: "3 x 55 ml" },
      ),
    ).toBe(false);
    expect(
      identityConsistent(
        { ...base, brand: "Dr. Oetker", productName: "Casa di Mama Salame", variant: "Salame", packageSize: null },
        { productName: "Dr. Oetker Ristorante pizza salami", brand: "Dr. Oetker" },
      ),
    ).toBe(false);
  });
});

describe("identityScore", () => {
  it("ranks exact brand + flavour + size above weak image-only hints and penalises approximate hits", () => {
    const strong = identityScore(base, {
      productName: "Milbona Goudse kaas oud",
      brand: "Milbona",
      packaging: "450 g",
      confidence: "high",
      source: "prijsprofeet",
    });
    const weak = identityScore(base, {
      productName: "Kaas",
      brand: "Milbona",
      confidence: "medium",
      source: "off",
    });
    const approx = identityScore(base, {
      productName: "Milbona Goudse kaas oud",
      brand: "Milbona",
      packaging: "450 g",
      confidence: "medium",
      source: "prijsprofeet",
      approximate: true,
    });
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThan(approx);
    expect(identityScore(base, { productName: "AH Geraspte kaas", brand: "AH", confidence: "high", source: "prijsprofeet" })).toBe(-1);
  });
});

describe("enrichCandidates", () => {
  it("attaches a photo hint without inventing an EAN, uses identity cache first, and leaves vision claims on failure", async () => {
    const match = {
      source: "prijsprofeet" as const,
      productName: "Milbona Goudse kaas oud 450 g",
      brand: "Milbona",
      packaging: "450 g",
      imageUrl: "https://example.com/cheese.jpg",
      confidence: "high" as const,
    };
    const findIdentity = vi.fn(async () => ({
      ok: true as const,
      cached: false,
      answer: {
        classification: "branded" as const,
        brand: "Milbona",
        match,
        alternatives: [],
        searched: { prijsprofeet: "match" as const, off: "skipped" as const },
        catalogProductId: "n-milbonagoudse01",
      },
    }));
    const cachedIdentity = vi.fn(() => null);
    const enriched = await enrichCandidates([base], { findIdentity, cachedIdentity });
    expect(enriched.lookups).toBeGreaterThanOrEqual(1);
    expect(enriched.candidates[0].imageUrl).toBe("https://example.com/cheese.jpg");
    expect(enriched.candidates[0].identity?.source).toBe("prijsprofeet");
    expect(enriched.candidates[0].catalogProductId).toBe("n-milbonagoudse01");
    expect(enriched.candidates[0].ean).toBeNull();
    expect(enriched.candidates[0].identity).not.toHaveProperty("ean");
    expect(findIdentity).toHaveBeenCalled();
    expect(findIdentity.mock.calls[0][0]).not.toMatch(/450/);

    const cachedLookup = vi.fn(() => ({
      ok: true as const,
      cached: true,
      answer: {
        classification: "branded" as const,
        brand: "Milbona",
        match,
        alternatives: [],
        searched: { prijsprofeet: "match" as const, off: "skipped" as const },
      },
    }));
    const fromCache = await enrichCandidates([base], { findIdentity, cachedIdentity: cachedLookup });
    expect(fromCache.cacheHits).toBeGreaterThanOrEqual(1);
    expect(fromCache.lookups).toBe(0);
    expect(findIdentity).toHaveBeenCalledTimes(enriched.lookups);

    const failed = await enrichCandidates([base], {
      findIdentity: async () => ({ ok: false as const, code: "unavailable" as const }),
      cachedIdentity: () => null,
    });
    expect(failed.failures).toBeGreaterThanOrEqual(1);
    expect(failed.candidates[0]).toEqual(base);
  });

  it("scores alternatives when the primary match contradicts the vision variant", async () => {
    const findIdentity = vi.fn(async () => ({
      ok: true as const,
      cached: false,
      answer: {
        classification: "branded" as const,
        brand: "Magnum",
        match: {
          source: "prijsprofeet" as const,
          productName: "Magnum Mini Almond",
          brand: "Magnum",
          packaging: "6 x 55 ml",
          imageUrl: "https://example.com/almond.jpg",
          confidence: "high" as const,
        },
        alternatives: [
          {
            source: "off" as const,
            productName: "Magnum Mini Classic",
            brand: "Magnum",
            packaging: "6 x 55 ml",
            imageUrl: "https://example.com/classic.jpg",
            confidence: "medium" as const,
          },
        ],
        searched: { prijsprofeet: "match" as const, off: "match" as const },
      },
    }));
    const candidate: VisualCandidate = {
      ...base,
      brand: "Magnum",
      productName: "Magnum mini Classic",
      genericName: "ijs",
      variant: "Classic",
      packageSize: "6 stuks",
    };
    const enriched = await enrichCandidates([candidate], { findIdentity, cachedIdentity: () => null });
    expect(enriched.candidates[0].identity?.productName).toMatch(/Classic/i);
    expect(enriched.candidates[0].imageUrl).toBe("https://example.com/classic.jpg");
  });

  it("runs lookups concurrently under an overall deadline and still returns visual candidates", async () => {
    const slow = {
      findIdentity: () => new Promise<never>(() => undefined),
      cachedIdentity: () => null,
    };
    const enriched = await enrichCandidates(
      [
        base,
        { ...base, observedCandidateId: "c2", variant: "jong", productName: "Milbona Goudse jong" },
        { ...base, observedCandidateId: "c3", variant: "belegen", productName: "Milbona belegen" },
      ],
      slow,
    );
    expect(enriched.candidates).toHaveLength(3);
    expect(enriched.candidates.every((candidate) => !candidate.identity)).toBe(true);
  }, 8_000);
});

describe("primaryProduct", () => {
  it("keeps the model primary when selection is required", () => {
    expect(primaryProduct(product, [{ ...base, variant: "Salame" }, { ...base, observedCandidateId: "c2", variant: "Speciale" }], true)).toBe(product);
  });
});
