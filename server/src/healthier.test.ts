import { describe, expect, it } from "vitest";
import { cacheKeyOf, precheckEvidence } from "./healthier.js";

const base = {
  name: "Pindakaas",
  productId: "pindakaas",
  ingredients: "Pinda's, suiker, zout",
  ingredientsSource: "off" as const,
  nutritionSource: "off" as const,
  matchConfidence: "exact" as const,
  evidenceVersion: "abc12345",
};

describe("precheckEvidence", () => {
  it("rejects weak or empty evidence without calling the model", () => {
    expect(precheckEvidence({ ...base, matchConfidence: "weak" })).toEqual({ ok: false, code: "insufficient-data" });
    expect(precheckEvidence({ ...base, ingredients: undefined, nutrition: undefined })).toEqual({ ok: false, code: "insufficient-data" });
    expect(precheckEvidence({ name: "" })).toEqual({ ok: false, code: "invalid" });
  });

  it("accepts barcode evidence with ingredients or macros", () => {
    expect(precheckEvidence(base)).toMatchObject({ ok: true });
    expect(
      precheckEvidence({
        ...base,
        ingredients: undefined,
        nutrition: { sugars100g: 12 },
        matchConfidence: "likely",
      }),
    ).toMatchObject({ ok: true });
  });

  it("builds a stable cache key from evidence version and model", () => {
    const a = cacheKeyOf(base, "gpt-test");
    const b = cacheKeyOf(base, "gpt-test");
    const c = cacheKeyOf({ ...base, evidenceVersion: "other" }, "gpt-test");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});
