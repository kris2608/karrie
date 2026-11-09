import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { PoolLike } from "./candidatesPg.js";
import type { Usage } from "./limits.js";
import {
  AlternativeSchema,
  FOOD_TYPES,
  HEALTHIER_INSTRUCTIONS,
  HEALTHIER_RULES_VERSION,
  sanitizeAlternative,
  type Alternative,
} from "./schema.js";

export const HEALTHIER_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ProductEvidenceInput = {
  productId?: string;
  gtin?: string;
  name: string;
  brand?: string;
  packageSize?: string;
  formulation?: string;
  ingredients?: string;
  nutrition?: Record<string, number | string | undefined>;
  nutriScore?: string;
  nutritionUnit?: "g" | "ml";
  ingredientsSource: "off" | "page" | "photo" | "none";
  nutritionSource: "off" | "page" | "none";
  matchConfidence: "exact" | "likely" | "weak";
  evidenceVersion: string;
};

export type HealthierResult =
  | { ok: true; alternative: Alternative; cached: boolean; usage?: Usage }
  | { ok: false; code: "insufficient-data" | "invalid" | "unavailable" | "refused" | "malformed" | "timeout" | "busy"; usage?: Usage };

const EvidenceSchema = z
  .object({
    productId: z.string().max(80).optional(),
    gtin: z.string().regex(/^\d{8,14}$/).optional(),
    name: z.string().min(1).max(80),
    brand: z.string().max(40).optional(),
    packageSize: z.string().max(24).optional(),
    formulation: z.string().max(40).optional(),
    ingredients: z.string().max(600).optional(),
    nutrition: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
    nutriScore: z.string().max(1).optional(),
    nutritionUnit: z.enum(["g", "ml"]).optional(),
    ingredientsSource: z.enum(["off", "page", "photo", "none"]),
    nutritionSource: z.enum(["off", "page", "none"]),
    matchConfidence: z.enum(["exact", "likely", "weak"]),
    evidenceVersion: z.string().min(4).max(64),
  })
  .strict();

type ResponsesClient = { responses: { create: (body: never, options?: { signal?: AbortSignal }) => Promise<unknown> } };

type RawResponse = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
};

const FORMAT = zodTextFormat(AlternativeSchema, "healthier_alternative");

function usageOf(response: RawResponse): Usage | undefined {
  if (!response.usage) return undefined;
  return {
    inputTokens: response.usage.input_tokens ?? 0,
    cachedInputTokens: response.usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
  };
}

/** Rules-first: do not call the model when evidence cannot support a mission. */
export function precheckEvidence(raw: unknown): { ok: true; evidence: ProductEvidenceInput } | { ok: false; code: "invalid" | "insufficient-data" } {
  const parsed = EvidenceSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "invalid" };
  const evidence = parsed.data as ProductEvidenceInput;
  if (evidence.matchConfidence === "weak") return { ok: false, code: "insufficient-data" };
  const hasIngredients = Boolean(evidence.ingredients?.trim());
  const n = evidence.nutrition ?? {};
  const hasMacros = ["sugars100g", "sugars", "salt100g", "salt", "fiber100g", "fibre", "saturatedFat100g", "saturatedFat"].some(
    (key) => typeof n[key] === "number",
  );
  if (!hasIngredients && !hasMacros) return { ok: false, code: "insufficient-data" };
  if (!(FOOD_TYPES as readonly string[]).includes(evidence.productId ?? "") && !hasIngredients && !evidence.gtin) {
    return { ok: false, code: "insufficient-data" };
  }
  return { ok: true, evidence };
}

export function cacheKeyOf(evidence: ProductEvidenceInput, model: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ v: evidence.evidenceVersion, rules: HEALTHIER_RULES_VERSION, model }))
    .digest("hex");
}

export function createHealthierCache(pool: PoolLike | null, now: () => number = Date.now) {
  return {
    async get(key: string): Promise<Alternative | null> {
      if (!pool) return null;
      try {
        const { rows } = await pool.query(
          `SELECT payload FROM healthier_assessments WHERE evidence_hash = $1 AND rules_version = $2 AND expires_at > $3`,
          [key, HEALTHIER_RULES_VERSION, new Date(now()).toISOString()],
        );
        const payload = rows[0]?.payload;
        if (!payload) return null;
        const raw = typeof payload === "string" ? JSON.parse(payload) : payload;
        const parsed = AlternativeSchema.safeParse(raw);
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    async set(key: string, model: string, alternative: Alternative): Promise<void> {
      if (!pool) return;
      const expires = new Date(now() + HEALTHIER_CACHE_TTL_MS).toISOString();
      try {
        await pool.query(
          `INSERT INTO healthier_assessments (evidence_hash, model, rules_version, payload, created_at, expires_at)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6)
           ON CONFLICT (evidence_hash) DO UPDATE SET model = EXCLUDED.model, rules_version = EXCLUDED.rules_version, payload = EXCLUDED.payload, created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at`,
          [key, model, HEALTHIER_RULES_VERSION, JSON.stringify(alternative), new Date(now()).toISOString(), expires],
        );
      } catch {
        /* cache is best-effort */
      }
    },
  };
}

export type HealthierAssessor = {
  assess: (raw: unknown) => Promise<HealthierResult>;
};

export function createHealthierAssessor(deps: {
  client: OpenAI;
  model: string;
  cache: ReturnType<typeof createHealthierCache>;
  timeoutMs?: number;
}): HealthierAssessor {
  const timeoutMs = deps.timeoutMs ?? 20_000;
  return {
    async assess(raw) {
      const pre = precheckEvidence(raw);
      if (!pre.ok) return { ok: false, code: pre.code };
      const key = cacheKeyOf(pre.evidence, deps.model);
      const cached = await deps.cache.get(key);
      if (cached) return { ok: true, alternative: sanitizeAlternative(cached, true), cached: true };

      const evidenceLine = JSON.stringify(pre.evidence, null, 0);
      const body = {
        model: deps.model,
        store: false,
        instructions: HEALTHIER_INSTRUCTIONS,
        input: [
          {
            role: "user" as const,
            content: [{ type: "input_text" as const, text: `Beoordeel dit productbewijs:\n${evidenceLine}` }],
          },
        ],
        text: { format: { type: FORMAT.type, name: FORMAT.name, strict: true, schema: FORMAT.schema } },
        max_output_tokens: 400,
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = (await (deps.client as unknown as ResponsesClient).responses.create(body as never, {
          signal: controller.signal,
        })) as RawResponse;
        const usage = usageOf(response);
        const parts = (response.output ?? []).filter((item) => item.type === "message").flatMap((item) => item.content ?? []);
        if (parts.some((part) => part.type === "refusal")) return { ok: false, code: "refused", usage };
        if (response.status === "incomplete") {
          return { ok: false, code: response.incomplete_details?.reason === "content_filter" ? "refused" : "unavailable", usage };
        }
        const text = parts.find((part) => part.type === "output_text")?.text;
        if (!text) return { ok: false, code: "malformed", usage };
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return { ok: false, code: "malformed", usage };
        }
        const alternative = AlternativeSchema.safeParse(parsed);
        if (!alternative.success) return { ok: false, code: "malformed", usage };
        const food = Boolean(pre.evidence.productId && (FOOD_TYPES as readonly string[]).includes(pre.evidence.productId));
        const sanitized = sanitizeAlternative(alternative.data, food || Boolean(pre.evidence.ingredients));
        await deps.cache.set(key, deps.model, sanitized);
        return { ok: true, alternative: sanitized, cached: false, usage };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return { ok: false, code: "timeout" };
        return { ok: false, code: "unavailable" };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
