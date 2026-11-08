import { parseName } from "../../domain/typedName";
import type { CategoryId, NamePhoto } from "../../domain/types";
import type { NameAnswer } from "../../services/images/nameImage";
import type { LookupStatus } from "../../storage/lookupStore";
import type { CustomEnrichment } from "../../state/reducer";

export type NameLookup = { status: LookupStatus; answer: NameAnswer | null };

/** What the tidy-up (normalize) said while the sheet was open; it only runs for names that are not a known brand. */
export type Tidy =
  | { status: "idle" | "running" | "none" }
  | { status: "ok"; enrichment: CustomEnrichment; illustrations: boolean }
  | { status: "brand"; brand: string };

export type NewProductView = {
  phase: "searching" | "found" | "plain" | "offline";
  brand?: string;
  category?: CategoryId;
  photo?: NamePhoto;
  drawing?: string;
};

export function brandedAnswer(lookup: NameLookup): NameAnswer | null {
  return lookup.answer?.classification === "branded" && lookup.answer.brand ? lookup.answer : null;
}

/** The tidy-up waits for the name search, as the background enrichment does, so a brand never reaches OpenAI. */
export function wantsTidy(lookup: NameLookup, tidy: Tidy): boolean {
  return tidy.status === "idle" && lookup.status !== "pending" && !brandedAnswer(lookup);
}

export function newProductView(lookup: NameLookup, tidy: Tidy, online: boolean): NewProductView {
  const branded = brandedAnswer(lookup);
  if (branded) return { phase: "found", brand: branded.brand, category: branded.category, ...(branded.match && { photo: branded.match }) };
  if (tidy.status === "brand") return { phase: "found", brand: tidy.brand };
  if (tidy.status === "ok") return { phase: "found", category: tidy.enrichment.category, drawing: tidy.enrichment.drawing };
  if (!online && (lookup.status === "pending" || tidy.status === "idle")) return { phase: "offline" };
  if (lookup.status === "pending" || tidy.status === "running" || wantsTidy(lookup, tidy)) return { phase: "searching" };
  return { phase: "plain" };
}

/** A refusal for being a brand names the brand by the typed words before any size or variant. */
export function refusedBrand(name: string): string {
  return parseName(name)?.base ?? name;
}
