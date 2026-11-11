import type { NameImageLookup } from "./nameImage.js";
import type { NameImage } from "./nameMatch.js";
import type { RecognizedProduct, VisualCandidate } from "./schema.js";

/** Provider-backed enrichment for a visual candidate. Never carries a verified EAN. */
export type IdentityHint = {
  productName: string;
  brand?: string;
  packaging?: string;
  imageUrl: string;
  confidence: "high" | "medium";
  source: "prijsprofeet" | "off";
};

export type EnrichedCandidate = VisualCandidate & {
  /** Supporting pack photo from unrestricted name search; not proof of exact SKU. */
  imageUrl?: string;
  identity?: IdentityHint;
};

export type IdentityEnrichment = {
  candidates: EnrichedCandidate[];
  /** How many provider lookups ran (excludes cache-only if callers care later). */
  lookups: number;
  failures: number;
};

const CONFLICT =
  /\b(?:gerasp(?:t|te)|rasp|blok|stuk|oud|jong|belegen|drink|smoothie|filet|steak|salame|speciale|aardbei|kers|mango|passie)\b/gi;

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function conflictTokens(text: string): string[] {
  return [...text.matchAll(CONFLICT)].map((match) => match[0].toLowerCase());
}

/** Query for unrestricted PrijsProfeet / OFF name search from visual claims. */
export function identityQuery(candidate: Pick<VisualCandidate, "brand" | "productName" | "genericName" | "variant" | "packageSize">): string {
  const brand = candidate.brand?.trim();
  const title = (candidate.productName ?? candidate.genericName ?? "").trim();
  const variant = candidate.variant?.trim();
  const size = candidate.packageSize?.trim();
  const parts: string[] = [];
  if (brand && title && !title.toLowerCase().includes(brand.toLowerCase())) parts.push(brand);
  if (title) parts.push(title);
  else if (brand) parts.push(brand);
  if (variant && title && !title.toLowerCase().includes(variant.toLowerCase())) parts.push(variant);
  if (size && title && !title.toLowerCase().includes(size.toLowerCase())) parts.push(size);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Reject provider rows that clearly contradict a visible variant/size cue
 * (e.g. grated vs block cheese, different printed flavour).
 */
export function identityConsistent(
  candidate: Pick<VisualCandidate, "variant" | "packageSize" | "productName" | "genericName" | "brand">,
  hint: Pick<IdentityHint, "productName" | "brand" | "packaging">,
): boolean {
  const visionText = normalize([candidate.brand, candidate.productName, candidate.genericName, candidate.variant, candidate.packageSize].filter(Boolean).join(" "));
  const providerText = normalize([hint.brand, hint.productName, hint.packaging].filter(Boolean).join(" "));
  if (!visionText || !providerText) return true;

  for (const word of conflictTokens(visionText)) {
    // If vision shows a discriminating word and the provider product uses a conflicting sibling, drop it.
    if (word === "geraspt" || word === "geraspte" || word === "rasp") {
      if (/\b(blok|stuk)\b/i.test(providerText) && !/\b(gerasp|rasp)\b/i.test(providerText)) return false;
    }
    if (word === "blok" || word === "stuk") {
      if (/\b(gerasp|rasp)\b/i.test(providerText) && !/\b(blok|stuk)\b/i.test(providerText)) return false;
    }
    if (word === "oud" && /\bjong\b/i.test(providerText) && !/\boud\b/i.test(providerText)) return false;
    if (word === "jong" && /\boud\b/i.test(providerText) && !/\bjong\b/i.test(providerText)) return false;
  }

  const variant = normalize(candidate.variant);
  if (variant && variant.length >= 3 && !providerText.includes(variant) && !normalize(hint.productName).includes(variant)) {
    // Soft: only reject when provider claims a different explicit flavour word from a small set.
    const otherFlavour = /\b(aardbei|kers|mango|passie|salame|speciale|naturel|paprika|BBQ|bolognese)\b/i.exec(providerText);
    if (otherFlavour && !variant.includes(otherFlavour[0].toLowerCase()) && !visionText.includes(otherFlavour[0].toLowerCase())) {
      return false;
    }
  }

  const size = normalize(candidate.packageSize);
  if (size) {
    const amount = size.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b/i);
    if (amount) {
      const providerAmount = providerText.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b/i);
      if (providerAmount) {
        const sameUnit = amount[2].toLowerCase() === providerAmount[2].toLowerCase();
        const sameValue = amount[1].replace(",", ".") === providerAmount[1].replace(",", ".");
        if (sameUnit && !sameValue) return false;
      }
    }
  }
  return true;
}

function hintFrom(image: NameImage): IdentityHint {
  return {
    productName: image.productName,
    ...(image.brand && { brand: image.brand }),
    ...(image.packaging && { packaging: image.packaging }),
    imageUrl: image.imageUrl,
    confidence: image.confidence,
    source: image.source,
  };
}

const MAX_LOOKUPS = 5;
const LOOKUP_TIMEOUT_MS = 4_000;

/**
 * Enrich visual candidates with unrestricted name-search identity hints (PrijsProfeet via searchName, then OFF).
 * Does not assign EAN/nutrition. Failures leave the visual candidate unchanged so the parent can still add.
 */
export async function enrichCandidates(
  candidates: VisualCandidate[],
  lookup: Pick<NameImageLookup, "find"> | undefined,
  options: { signal?: AbortSignal } = {},
): Promise<IdentityEnrichment> {
  if (!lookup || candidates.length === 0) {
    return { candidates: candidates.map((candidate) => ({ ...candidate })), lookups: 0, failures: 0 };
  }

  let lookups = 0;
  let failures = 0;
  const enriched: EnrichedCandidate[] = [];

  for (const candidate of candidates.slice(0, MAX_LOOKUPS)) {
    const query = identityQuery(candidate);
    if (!query || options.signal?.aborted) {
      enriched.push({ ...candidate });
      continue;
    }
    lookups += 1;
    try {
      const result = await Promise.race([
        lookup.find(query),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS)),
      ]);
      if (!result || !result.ok || !result.answer.match) {
        if (result && !result.ok) failures += 1;
        enriched.push({ ...candidate });
        continue;
      }
      const hint = hintFrom(result.answer.match);
      if (!identityConsistent(candidate, hint)) {
        enriched.push({ ...candidate });
        continue;
      }
      enriched.push({ ...candidate, imageUrl: hint.imageUrl, identity: hint });
    } catch {
      failures += 1;
      enriched.push({ ...candidate });
    }
  }

  // Pass through any candidates beyond the lookup cap unchanged.
  for (const candidate of candidates.slice(MAX_LOOKUPS)) enriched.push({ ...candidate });

  return { candidates: enriched, lookups, failures };
}

/** Prefer an enriched primary product when selection is not required. */
export function primaryProduct(
  product: RecognizedProduct,
  candidates: EnrichedCandidate[],
  needsSelection: boolean,
): RecognizedProduct {
  if (needsSelection || candidates.length !== 1) return product;
  const only = candidates[0];
  if (!only) return product;
  // Keep healthier-alternative / people flags from the model primary; overlay the single visual candidate text.
  return {
    ...product,
    productName: only.productName ?? product.productName,
    genericName: only.genericName ?? product.genericName,
    catalogType: only.catalogType ?? product.catalogType,
    specificProduct: only.specificProduct,
    brand: only.brand ?? product.brand,
    variant: only.variant ?? product.variant,
    packageSize: only.packageSize ?? product.packageSize,
    category: only.category ?? product.category,
    subcategory: only.subcategory ?? product.subcategory,
    // Vision EAN stays a hint on the product; never copy provider identity into pack.ean here.
    ean: only.ean ?? product.ean,
    confidence: only.confidence,
    inferredFields: only.inferredFields.length ? only.inferredFields : product.inferredFields,
  };
}
