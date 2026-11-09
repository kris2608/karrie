import { assembleProductEvidence, isAssessable, isBareGeneric, type ProductEvidence } from "../../domain/productEvidence";
import { factsFor, type ProductFacts } from "../../domain/productFacts";
import type { AdventureItem, AlternativeAssessment } from "../../domain/types";
import type { RecognizedAlternative } from "../vision/types";

export type HealthierAssessResult =
  | { status: "ok"; alternative: RecognizedAlternative; cached: boolean }
  | { status: "error"; code: "insufficient-data" | "invalid" | "unavailable" | "rate-limited" | "network" };

type Deps = {
  origin: string;
  fetch: typeof fetch;
  pageFacts?: (item: AdventureItem) => ProductFacts | undefined;
};

function mapSource(evidence: ProductEvidence): AlternativeAssessment["source"] {
  if (evidence.ingredientsSource === "off" || evidence.nutritionSource === "off") return "barcode";
  if (evidence.ingredientsSource === "page" || evidence.nutritionSource === "page") return "facts";
  return "photo";
}

export function evidenceForItem(item: AdventureItem, pageFacts?: ProductFacts): ProductEvidence {
  return assembleProductEvidence(item, pageFacts);
}

/** Prefer these catalog types first when preparing missions (Phase 1 focus). */
export const HEALTHIER_PRIORITY_IDS = ["pindakaas", "yoghurt", "brood", "muesli", "havermout", "noten"] as const;

export function healthierPriority(item: AdventureItem): number {
  const index = (HEALTHIER_PRIORITY_IDS as readonly string[]).indexOf(item.productId ?? "");
  return index === -1 ? HEALTHIER_PRIORITY_IDS.length : index;
}

/** Eligible draft items that still need an assessment for the current evidence. */
export function needsHealthierAssess(item: AdventureItem, pageFacts?: ProductFacts): boolean {
  if (item.status === "found") return false;
  if (isBareGeneric(item)) return false;
  if (item.alternative?.status === "possible" && item.alternative.source === "photo") return false;
  const evidence = assembleProductEvidence(item, pageFacts);
  if (!isAssessable(evidence)) return false;
  if (item.alternative?.evidenceVersion === evidence.evidenceVersion) return false;
  return true;
}

export function createHealthierClient(deps: Deps) {
  const base = deps.origin.replace(/\/$/, "");

  return {
    evidenceFor(item: AdventureItem): ProductEvidence {
      const page = deps.pageFacts?.(item);
      return assembleProductEvidence(item, page);
    },

    sourceFor(evidence: ProductEvidence): AlternativeAssessment["source"] {
      return mapSource(evidence);
    },

    async assess(evidence: ProductEvidence): Promise<HealthierAssessResult> {
      if (!base) return { status: "error", code: "unavailable" };
      try {
        const response = await deps.fetch(`${base}/api/products/healthier-alternative`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "omit",
          referrerPolicy: "no-referrer",
          body: JSON.stringify(evidence),
        });
        const body = (await response.json().catch(() => null)) as
          | { status?: string; code?: string; alternative?: RecognizedAlternative; cached?: boolean }
          | null;
        if (response.status === 429) return { status: "error", code: "rate-limited" };
        if (response.status === 422 && body?.code === "insufficient-data") return { status: "error", code: "insufficient-data" };
        if (response.status === 422) return { status: "error", code: "invalid" };
        if (!response.ok || body?.status !== "ok" || !body.alternative) return { status: "error", code: "unavailable" };
        return { status: "ok", alternative: body.alternative, cached: Boolean(body.cached) };
      } catch {
        return { status: "error", code: "network" };
      }
    },
  };
}

export const healthierClient = createHealthierClient({
  origin: import.meta.env.VITE_API_ORIGIN ?? "",
  fetch: (...args) => fetch(...args),
  pageFacts: (item) => factsFor(item, () => undefined),
});
