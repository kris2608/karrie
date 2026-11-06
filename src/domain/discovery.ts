import { productById } from "../data/catalog";
import type { RecognizedAlternative } from "../services/vision/types";
import { normalize } from "./matchProduct";
import type { AdventureItem, AlternativeAssessment, Criterion, Evidence, PackInfo } from "./types";

export const CRITERIA: readonly Criterion[] = ["no-added-sugar", "no-added-salt", "unsalted", "wholegrain", "less-sugar", "more-fibre", "less-saturated-fat"];
export const MAX_MISSIONS = 3;

/**
 * Swaps to a different catalog type that keep the shopping purpose. Anything
 * else must stay the same type (peanut butter -> 100% peanut butter).
 */
const SAME_PURPOSE: Record<string, readonly string[]> = {
  brood: ["volkorenbrood"],
  bolletjes: ["volkorenbrood"],
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

/** Applies the local guards to the model's suggestion. Undefined when there is nothing to keep. */
export function resolveAssessment(
  alternative: RecognizedAlternative | undefined,
  ownType: string | undefined,
  ingredients?: string,
  model?: string,
  now = Date.now(),
): AlternativeAssessment | undefined {
  if (!alternative) return undefined;
  const base = { source: "photo" as const, model, assessedAt: now, reason: alternative.reason ?? undefined };
  const none = (status: AlternativeAssessment["status"]): AlternativeAssessment => ({ ...base, status, evidence: alternative.evidence, criteria: [] });
  if (alternative.status !== "possible") return none(alternative.status);
  const target = alternative.targetType ? productById(alternative.targetType) : undefined;
  if (!ownType || !target || !samePurpose(ownType, target.id)) return none("none");
  const known = alternative.criteria.filter((criterion) => CRITERIA.includes(criterion));
  const checked = labelCheck(known, alternative.evidence, ingredients);
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
