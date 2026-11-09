import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PoolLike } from "./candidatesPg.js";
import { migrate } from "./db/migrate.js";
import { cacheKeyOf, createHealthierAssessor, createHealthierCache, precheckEvidence } from "./healthier.js";
import { HEALTHIER_RULES_VERSION } from "./schema.js";

const MIGRATIONS = join(fileURLToPath(new URL("../migrations", import.meta.url)));

const base = {
  name: "Pindakaas",
  productId: "pindakaas",
  ingredients: "Pinda's, suiker, zout",
  ingredientsSource: "off" as const,
  nutritionSource: "off" as const,
  matchConfidence: "exact" as const,
  evidenceVersion: "abc12345",
};

/** Calvé-style OFF peanut butter with sugar + salt on the label. */
const CALVE_EVIDENCE = {
  productId: "pindakaas",
  gtin: "8710400322100",
  name: "Calvé Pindakaas",
  brand: "Calvé",
  packageSize: "350 g",
  ingredients: "Pinda's 90%, suiker, plantaardige oliën (raapzaad, palm), zout",
  nutrition: { energyKcal100g: 644, sugars100g: 5.9, fat100g: 53, saturatedFat100g: 9.6, salt100g: 0.91, proteins100g: 25 },
  nutriScore: "C",
  nutritionUnit: "g" as const,
  ingredientsSource: "off" as const,
  nutritionSource: "off" as const,
  matchConfidence: "exact" as const,
  evidenceVersion: "calve-fixture-v1",
};

const MOCK_ALTERNATIVE = {
  status: "possible",
  evidence: "label",
  criteria: ["no-added-sugar", "no-added-salt"],
  alternativeType: "100% pindakaas zonder toegevoegd zout of suiker",
  targetType: "pindakaas",
  reason: "Suiker en zout staan op het etiket.",
  parentExplanation: "Er staan suiker en zout in de ingrediënten",
  childPrompt: "Kun jij pindakaas met alleen pinda's vinden?",
};

function memoryPool() {
  const db = newDb({ noAstCoverageCheck: true });
  const { Pool } = db.adapters.createPg();
  return new Pool() as unknown as PoolLike;
}

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

describe("Calvé peanut-butter fixture assess", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mocks OpenAI, writes cache, and returns a label-backed alternative", async () => {
    const pool = memoryPool();
    await migrate(pool, MIGRATIONS);
    const cache = createHealthierCache(pool);
    const create = vi.fn(async () => ({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(MOCK_ALTERNATIVE) }] }],
      usage: { input_tokens: 120, output_tokens: 80, input_tokens_details: { cached_tokens: 0 } },
    }));
    const assessor = createHealthierAssessor({
      client: { responses: { create } } as never,
      model: "gpt-fixture",
      cache,
    });

    const first = await assessor.assess(CALVE_EVIDENCE);
    expect(first).toMatchObject({ ok: true, cached: false, alternative: { status: "possible", evidence: "label", targetType: "pindakaas" } });
    expect(create).toHaveBeenCalledTimes(1);

    const key = cacheKeyOf(CALVE_EVIDENCE, "gpt-fixture");
    const { rows } = await pool.query(
      `SELECT evidence_hash, rules_version, payload FROM healthier_assessments WHERE evidence_hash = $1`,
      [key],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].rules_version).toBe(HEALTHIER_RULES_VERSION);
    expect(typeof rows[0].payload === "string" ? JSON.parse(rows[0].payload) : rows[0].payload).toMatchObject({
      status: "possible",
      targetType: "pindakaas",
    });

    const second = await assessor.assess(CALVE_EVIDENCE);
    expect(second).toMatchObject({ ok: true, cached: true });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("rejects bare melk / empty evidence without calling the model", async () => {
    const create = vi.fn();
    const assessor = createHealthierAssessor({
      client: { responses: { create } } as never,
      model: "gpt-fixture",
      cache: createHealthierCache(null),
    });
    expect(await assessor.assess({ name: "Melk", productId: "melk", ingredientsSource: "none", nutritionSource: "none", matchConfidence: "exact", evidenceVersion: "bare-melk" })).toEqual({
      ok: false,
      code: "insufficient-data",
    });
    expect(
      await assessor.assess({
        name: "Pindakaas",
        productId: "pindakaas",
        ingredientsSource: "none",
        nutritionSource: "none",
        matchConfidence: "exact",
        evidenceVersion: "empty",
      }),
    ).toEqual({ ok: false, code: "insufficient-data" });
    expect(create).not.toHaveBeenCalled();
  });
});
