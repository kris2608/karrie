import { productById } from "../data/catalog";
import type { RecognizedAlternative } from "../services/vision/types";
import { normalize } from "./matchProduct";
import type { ProductEvidence } from "./productEvidence";
import type { AdventureItem, AlternativeAssessment, Criterion, Evidence, Nutrition, PackInfo } from "./types";

export const CRITERIA: readonly Criterion[] = ["no-added-sugar", "no-added-salt", "unsalted", "wholegrain", "less-sugar", "more-fibre", "less-saturated-fat"];
export const MAX_MISSIONS = 3;
export const HEALTHIER_RULES_VERSION = "2026-11-09";

/**
 * Swaps to a different catalog type that keep the shopping purpose. Anything
 * else must stay the same type (peanut butter -> 100% peanut butter).
 */
const SAME_PURPOSE: Record<string, readonly string[]> = {
  ontbijtgranen: ["muesli", "havermout"],
};

export function samePurpose(from: string, to: string): boolean {
  return from === to || (SAME_PURPOSE[from]?.includes(to) ?? false);
}

const SUGAR_TERMS = ["suiker", "glucose", "fructose", "dextrose", "sacharose", "stroop", "honing", "maltodextrine", "invertsuiker", "rietsuiker", "sugar"];
const SALT_TERMS = ["zout", "zeezout", "natrium", "salt", "sodium"];
const WHOLEGRAIN_TERMS = ["volkoren", "wholegrain", "whole grain", "volkorenmeel", "volkorentarwe"];

function mentions(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

/**
 * Whether the printed ingredients show the issue a criterion fixes: true when
 * they do, false when they contradict it, null when text cannot tell.
 */
export function labelShows(criterion: Criterion, ingredients: string): boolean | null {
  const text = normalize(ingredients);
  switch (criterion) {
    case "no-added-sugar":
    case "less-sugar":
      return mentions(text, SUGAR_TERMS);
    case "no-added-salt":
    case "unsalted":
      return mentions(text, SALT_TERMS);
    case "wholegrain":
      return !mentions(text, WHOLEGRAIN_TERMS);
    default:
      return null;
  }
}

/**
 * Keeps "label" evidence only when the printed ingredients back at least one
 * criterion, and drops criteria the label contradicts.
 */
export function labelCheck(criteria: Criterion[], evidence: Evidence, ingredients?: string): { criteria: Criterion[]; evidence: Evidence } {
  if (!ingredients) return { criteria, evidence: evidence === "label" ? "inferred" : evidence };
  const checks = criteria.map((criterion) => [criterion, labelShows(criterion, ingredients)] as const);
  const kept = checks.filter(([, shown]) => shown !== false).map(([criterion]) => criterion);
  const backed = checks.some(([, shown]) => shown === true);
  return { criteria: kept, evidence: evidence === "label" && !backed ? "inferred" : evidence };
}

/**
 * Nutrition can support fibre / sat-fat / less-sugar only with comparable per-100 values.
 * Never uses Nutri-Score alone. Total sugars without ingredient cues do not prove added sugar.
 */
export function nutritionSupports(criterion: Criterion, nutrition: Nutrition | undefined, ingredients?: string): boolean | null {
  if (!nutrition) return null;
  switch (criterion) {
    case "more-fibre":
      return nutrition.fiber100g !== undefined ? nutrition.fiber100g < 3 : null;
    case "less-saturated-fat":
      return nutrition.saturatedFat100g !== undefined ? nutrition.saturatedFat100g > 5 : null;
    case "less-sugar":
      if (nutrition.sugars100g === undefined) return null;
      if (ingredients && labelShows("less-sugar", ingredients) === true) return nutrition.sugars100g > 5;
      return null;
    default:
      return null;
  }
}

export function criteriaWithNutrition(
  criteria: Criterion[],
  evidence: Evidence,
  ingredients: string | undefined,
  nutrition: Nutrition | undefined,
): { criteria: Criterion[]; evidence: Evidence } {
  const labeled = labelCheck(criteria, evidence, ingredients);
  if (!nutrition) return labeled;
  const kept = labeled.criteria.filter((criterion) => {
    const shown = nutritionSupports(criterion, nutrition, ingredients);
    return shown !== false;
  });
  const backedByNutrition = labeled.criteria.some((criterion) => nutritionSupports(criterion, nutrition, ingredients) === true);
  return {
    criteria: kept,
    evidence: labeled.evidence === "inferred" && backedByNutrition && !ingredients ? "inferred" : labeled.evidence,
  };
}

function sentence(text: string) {
  const trimmed = text.trim().replace(/[.!]+$/, "");
  return trimmed ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}.` : "";
}

export function parentLine(explanation: string | undefined, evidence: Evidence): string | undefined {
  if (!explanation) return undefined;
  if (evidence === "label") {
    const body = sentence(explanation.replace(/\s(waarschijnlijk|mogelijk)\b/gi, ""));
    return /^op het etiket/i.test(body) ? body : `Op het etiket gezien: ${body.replace(/^./, (first) => first.toLowerCase())}`;
  }
  const body = sentence(explanation);
  const qualified = /waarschijnlijk|mogelijk|vaak/i.test(body) ? body : `Waarschijnlijk: ${body.replace(/^./, (first) => first.toLowerCase())}`;
  return `${qualified} Kijk even op het etiket.`;
}

export type ResolveOptions = {
  source?: AlternativeAssessment["source"];
  nutrition?: Nutrition;
  evidenceVersion?: string;
  model?: string;
  now?: number;
};

/** Applies the local guards to the model's suggestion. Undefined when there is nothing to keep. */
export function resolveAssessment(
  alternative: RecognizedAlternative | undefined,
  ownType: string | undefined,
  ingredients?: string,
  modelOrOptions?: string | ResolveOptions,
  nowArg = Date.now(),
): AlternativeAssessment | undefined {
  if (!alternative) return undefined;
  const options: ResolveOptions =
    typeof modelOrOptions === "string" || modelOrOptions === undefined
      ? { source: "photo", model: modelOrOptions, now: nowArg }
      : modelOrOptions;
  const source = options.source ?? "photo";
  const now = options.now ?? Date.now();
  const base = {
    source,
    model: options.model,
    assessedAt: now,
    reason: alternative.reason ?? undefined,
    ...(options.evidenceVersion && { evidenceVersion: options.evidenceVersion }),
  };
  const none = (status: AlternativeAssessment["status"]): AlternativeAssessment => ({
    ...base,
    status,
    evidence: alternative.evidence,
    criteria: [],
  });
  if (alternative.status !== "possible") return none(alternative.status);
  const target = alternative.targetType ? productById(alternative.targetType) : undefined;
  if (!ownType || !target || !samePurpose(ownType, target.id)) return none("none");
  const known = alternative.criteria.filter((criterion) => CRITERIA.includes(criterion));
  const checked = criteriaWithNutrition(known, alternative.evidence, ingredients, options.nutrition);
  if (!checked.criteria.length) return none("none");
  if (checked.evidence === "none") return none("insufficient-data");
  return {
    ...base,
    status: "possible",
    evidence: checked.evidence,
    criteria: checked.criteria,
    alternativeType: alternative.alternativeType ?? target.name,
    targetType: target.id,
    parentExplanation: parentLine(alternative.parentExplanation ?? undefined, checked.evidence),
    childPrompt: alternative.childPrompt ?? `Kun jij ${(alternative.alternativeType ?? target.name).toLowerCase()} vinden?`,
  };
}

/** Rules-first gate before calling the model: weak or empty evidence → insufficient-data. */
export function precheckEvidence(evidence: ProductEvidence): "ok" | "insufficient-data" {
  if (evidence.matchConfidence === "weak") return "insufficient-data";
  if (!evidence.ingredients && !evidence.nutrition) return "insufficient-data";
  return "ok";
}

export function hasSuggestion(pack: PackInfo): boolean {
  const alternative = pack.alternative;
  return Boolean(alternative?.status === "possible" && alternative.targetType && productById(alternative.targetType));
}

/** Label evidence is on by default; a guess waits for the parent. */
export function missionOn(item: Keyed, declined: readonly string[] = []): boolean {
  if (!hasSuggestion(item)) return false;
  if (item.missionEnabled !== undefined) return item.missionEnabled;
  return item.alternative?.evidence === "label" && !declined.includes(declineKey(item));
}

type Keyed = PackInfo & { name: string };

/** Same product, same suggestion: a parent's "no" sticks across lists. */
export function declineKey(item: Keyed): string {
  return `${normalize(`${item.brand ?? ""} ${item.name}`)}>${item.alternative?.targetType ?? ""}`;
}

export function pickMissions(items: AdventureItem[], enabled: boolean, declined: readonly string[] = []): string[] {
  if (!enabled) return [];
  return items
    .filter((item) => item.status !== "found" && missionOn(item, declined))
    .slice(0, MAX_MISSIONS)
    .map((item) => item.id);
}

export type MissionBadge = "hundred" | "grain" | "no-sugar" | "no-salt" | "less-fat";

/** One small visual cue on the example card; never a number. */
export function badgeFor(assessment: AlternativeAssessment): MissionBadge {
  const criteria = new Set(assessment.criteria);
  if (/100\s?%/.test(assessment.alternativeType ?? "")) return "hundred";
  if (criteria.has("wholegrain") || criteria.has("more-fibre")) return "grain";
  if (criteria.has("no-added-sugar") || criteria.has("less-sugar")) return "no-sugar";
  if (criteria.has("no-added-salt") || criteria.has("unsalted")) return "no-salt";
  return "less-fat";
}
