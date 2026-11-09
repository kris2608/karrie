import { describe, expect, it, vi } from "vitest";
import type { AdventureItem } from "../../domain/types";
import { createHealthierClient, needsHealthierAssess } from "./client";

const branded: AdventureItem = {
  id: "i1",
  productId: "pindakaas",
  name: "Pindakaas",
  icon: "pindakaas",
  category: "pantry",
  quantity: 1,
  status: "pending",
  brand: "Calvé",
  ean: "8715700112345",
  ingredients: "Pinda's, suiker, zout",
  barcode: { status: "off-exact", sourceName: "Open Food Facts", sourceUrl: "https://world.openfoodfacts.org", at: 1 },
};

describe("healthier client eligibility", () => {
  it("skips bare generics and photo assessments that are already possible", () => {
    expect(
      needsHealthierAssess({
        id: "g",
        productId: "melk",
        name: "Melk",
        icon: "melk",
        category: "dairy",
        quantity: 1,
        status: "pending",
      }),
    ).toBe(false);
    expect(
      needsHealthierAssess({
        ...branded,
        alternative: { status: "possible", evidence: "label", criteria: ["no-added-sugar"], targetType: "pindakaas", source: "photo", assessedAt: 1 },
      }),
    ).toBe(false);
    expect(needsHealthierAssess(branded)).toBe(true);
  });

  it("posts evidence and maps insufficient-data", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: "ok",
          cached: true,
          alternative: {
            status: "possible",
            evidence: "label",
            criteria: ["no-added-sugar"],
            alternativeType: "100% pindakaas",
            targetType: "pindakaas",
            reason: null,
            parentExplanation: "Suiker op het etiket",
            childPrompt: "Kun jij pindakaas met alleen pinda's vinden?",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ status: "error", code: "insufficient-data" }),
      });
    const client = createHealthierClient({ origin: "https://api.example", fetch: fetchFn as typeof fetch });
    const evidence = client.evidenceFor(branded);
    await expect(client.assess(evidence)).resolves.toMatchObject({ status: "ok", cached: true });
    await expect(client.assess(evidence)).resolves.toEqual({ status: "error", code: "insufficient-data" });
  });
});
