import { describe, expect, it, vi } from "vitest";
import { enrichCandidates, identityConsistent, identityQuery, identityScore, primaryProduct } from "./recognizeIdentity.js";
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
  it("builds brand + discriminating title without duplicating the brand", () => {
    expect(identityQuery(base)).toBe("Milbona Goudse oud 450 g");
    expect(identityQuery({ ...base, productName: "Milbona Goudse oud 450 g", packageSize: "450 g" })).toBe("Milbona Goudse oud 450 g");
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
});

describe("identityScore", () => {
  it("ranks exact brand + flavour + size above weak image-only hints", () => {
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
    expect(strong).toBeGreaterThan(weak);
    expect(identityScore(base, { productName: "AH Geraspte kaas", brand: "AH", confidence: "high", source: "prijsprofeet" })).toBe(-1);
  });
});

describe("enrichCandidates", () => {
  it("attaches a photo hint without inventing an EAN, uses cache first, and leaves vision claims on failure", async () => {
    const match = {
      source: "prijsprofeet" as const,
      productName: "Milbona Goudse kaas oud 450 g",
      brand: "Milbona",
      packaging: "450 g",
      imageUrl: "https://example.com/cheese.jpg",
      confidence: "high" as const,
    };
    const find = vi.fn(async () => ({
      ok: true as const,
      cached: false,
      answer: {
        classification: "branded" as const,
        brand: "Milbona",
        match,
        alternatives: [],
        searched: { prijsprofeet: "match" as const, off: "skipped" as const },
      },
    }));
    const cached = vi.fn(() => null);
    const enriched = await enrichCandidates([base], { find, cached });
    expect(enriched.lookups).toBe(1);
    expect(enriched.candidates[0].imageUrl).toBe("https://example.com/cheese.jpg");
    expect(enriched.candidates[0].identity?.source).toBe("prijsprofeet");
    expect(enriched.candidates[0].ean).toBeNull();
    expect(enriched.candidates[0].identity).not.toHaveProperty("ean");
    expect(find).toHaveBeenCalledTimes(1);

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
    const fromCache = await enrichCandidates([base], { find, cached: cachedLookup });
    expect(fromCache.cacheHits).toBe(1);
    expect(fromCache.lookups).toBe(0);
    expect(find).toHaveBeenCalledTimes(1);

    const failed = await enrichCandidates([base], {
      find: async () => ({ ok: false as const, code: "unavailable" as const }),
      cached: () => null,
    });
    expect(failed.failures).toBe(1);
    expect(failed.candidates[0]).toEqual(base);
  });

  it("runs lookups concurrently under an overall deadline and still returns visual candidates", async () => {
    const slow = {
      find: () => new Promise(() => undefined),
      cached: () => null,
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
