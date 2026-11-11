import { describe, expect, it } from "vitest";
import { enrichCandidates, identityConsistent, identityQuery, primaryProduct } from "./recognizeIdentity.js";
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
  it("rejects grated cheese when vision showed a block, and mismatched sizes", () => {
    expect(identityConsistent(base, { productName: "Milbona Geraspte kaas jong", brand: "Milbona" })).toBe(false);
    expect(identityConsistent({ ...base, variant: "geraspt", productName: "Milbona geraspte kaas" }, { productName: "Milbona kaas blok oud", brand: "Milbona" })).toBe(
      false,
    );
    expect(identityConsistent(base, { productName: "Milbona Goudse oud", brand: "Milbona", packaging: "300 g" })).toBe(false);
    expect(identityConsistent(base, { productName: "Milbona Goudse oud 48+", brand: "Milbona", packaging: "450 g" })).toBe(true);
  });
});

describe("enrichCandidates", () => {
  it("attaches a photo hint without inventing an EAN, and leaves vision claims on failure", async () => {
    const lookup = {
      find: async () => ({
        ok: true as const,
        cached: false,
        answer: {
          classification: "branded" as const,
          brand: "Milbona",
          match: {
            source: "prijsprofeet" as const,
            productName: "Milbona Goudse kaas oud 450 g",
            brand: "Milbona",
            packaging: "450 g",
            imageUrl: "https://example.com/cheese.jpg",
            confidence: "high" as const,
          },
          alternatives: [],
          searched: { prijsprofeet: "match" as const, off: "skipped" as const },
        },
      }),
    };
    const enriched = await enrichCandidates([base], lookup);
    expect(enriched.lookups).toBe(1);
    expect(enriched.candidates[0].imageUrl).toBe("https://example.com/cheese.jpg");
    expect(enriched.candidates[0].identity?.source).toBe("prijsprofeet");
    expect(enriched.candidates[0].ean).toBeNull();
    expect(enriched.candidates[0].identity).not.toHaveProperty("ean");

    const failed = await enrichCandidates([base], {
      find: async () => ({ ok: false as const, code: "unavailable" as const }),
    });
    expect(failed.failures).toBe(1);
    expect(failed.candidates[0]).toEqual(base);
  });

  it("times out enrichment and still returns the visual candidate", async () => {
    const enriched = await enrichCandidates([base], {
      find: () => new Promise(() => undefined),
    });
    expect(enriched.candidates[0].observedCandidateId).toBe("c1");
    expect(enriched.candidates[0].identity).toBeUndefined();
  });
});

describe("primaryProduct", () => {
  it("keeps the model primary when selection is required", () => {
    expect(primaryProduct(product, [{ ...base, variant: "Salame" }, { ...base, observedCandidateId: "c2", variant: "Speciale" }], true)).toBe(product);
  });
});
