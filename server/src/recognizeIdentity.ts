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
  /** Evidence score used for ranking; never an EAN proof. */
  score: number;
};

export type EnrichedCandidate = VisualCandidate & {
  /** Supporting pack photo from unrestricted name search; not proof of exact SKU. */
  imageUrl?: string;
  identity?: IdentityHint;
};

export type IdentityEnrichment = {
  candidates: EnrichedCandidate[];
  lookups: number;
  failures: number;
  cacheHits: number;
};

const CONFLICT =
  /\b(?:gerasp(?:t|te)|rasp|blok|stuk|oud|jong|belegen|drink|smoothie|filet|steak|salame|speciale|aardbei|kers|mango|passie|naturel|paprika)\b/gi;

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
 * Reject provider rows that clearly contradict a visible brand/variant/size cue.
 * Fuzzy name hits never become an EAN.
 */
export function identityConsistent(
  candidate: Pick<VisualCandidate, "variant" | "packageSize" | "productName" | "genericName" | "brand">,
  hint: Pick<IdentityHint, "productName" | "brand" | "packaging">,
): boolean {
  const visionText = normalize([candidate.brand, candidate.productName, candidate.genericName, candidate.variant, candidate.packageSize].filter(Boolean).join(" "));
  const providerText = normalize([hint.brand, hint.productName, hint.packaging].filter(Boolean).join(" "));
  if (!visionText || !providerText) return true;

  const visionBrand = normalize(candidate.brand);
  const hintBrand = normalize(hint.brand);
  if (visionBrand && hintBrand && visionBrand !== hintBrand && !visionBrand.includes(hintBrand) && !hintBrand.includes(visionBrand)) {
    return false;
  }

  for (const word of conflictTokens(visionText)) {
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
    const otherFlavour = /\b(aardbei|kers|mango|passie|salame|speciale|naturel|paprika|bbq|bolognese|onion)\b/i.exec(providerText);
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

/** Evidence score for ranking identity hints against a visual candidate. Higher is better. */
export function identityScore(
  candidate: Pick<VisualCandidate, "brand" | "productName" | "genericName" | "variant" | "packageSize" | "confidence">,
  hint: Pick<IdentityHint, "productName" | "brand" | "packaging" | "confidence" | "source">,
): number {
  if (!identityConsistent(candidate, hint)) return -1;
  let score = hint.confidence === "high" ? 4 : 2;
  if (hint.source === "prijsprofeet") score += 1;
  const visionBrand = normalize(candidate.brand);
  const hintBrand = normalize(hint.brand);
  if (visionBrand && hintBrand && (visionBrand === hintBrand || visionBrand.includes(hintBrand) || hintBrand.includes(visionBrand))) score += 6;
  const variant = normalize(candidate.variant);
  const providerText = normalize([hint.brand, hint.productName, hint.packaging].filter(Boolean).join(" "));
  if (variant && providerText.includes(variant)) score += 5;
  const size = normalize(candidate.packageSize);
  if (size) {
    const amount = size.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b/i);
    if (amount && providerText.includes(`${amount[1].replace(",", ".")} ${amount[2].toLowerCase()}`)) score += 3;
    else if (amount && new RegExp(`${amount[1].replace(",", ".")}\\s*${amount[2]}`, "i").test(providerText)) score += 3;
  }
  const title = normalize(candidate.productName ?? candidate.genericName);
  if (title && normalize(hint.productName).includes(title.split(" ")[0] ?? "")) score += 1;
  return score;
}

function hintFrom(image: NameImage, score: number): IdentityHint {
  return {
    productName: image.productName,
    ...(image.brand && { brand: image.brand }),
    ...(image.packaging && { packaging: image.packaging }),
    imageUrl: image.imageUrl,
    confidence: image.confidence,
    source: image.source,
    score,
  };
}

const MAX_LOOKUPS = 5;
const LOOKUP_TIMEOUT_MS = 3_500;
const OVERALL_DEADLINE_MS = 5_000;
const CONCURRENCY = 3;

type LookupApi = Pick<NameImageLookup, "find" | "cached">;

async function enrichOne(
  candidate: VisualCandidate,
  lookup: LookupApi,
  signal: AbortSignal | undefined,
): Promise<{ candidate: EnrichedCandidate; lookups: number; failures: number; cacheHits: number }> {
  const query = identityQuery(candidate);
  if (!query || signal?.aborted) return { candidate: { ...candidate }, lookups: 0, failures: 0, cacheHits: 0 };

  const cached = lookup.cached?.(query) ?? null;
  if (cached?.ok && cached.answer.match) {
    const score = identityScore(candidate, {
      productName: cached.answer.match.productName,
      brand: cached.answer.match.brand,
      packaging: cached.answer.match.packaging,
      confidence: cached.answer.match.confidence,
      source: cached.answer.match.source,
    });
    if (score >= 0) {
      const hint = hintFrom(cached.answer.match, score);
      return { candidate: { ...candidate, imageUrl: hint.imageUrl, identity: hint }, lookups: 0, failures: 0, cacheHits: 1 };
    }
  }

  try {
    const result = await Promise.race([
      lookup.find(query),
      new Promise<null>((resolve) => {
        const timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve(null);
        }, { once: true });
      }),
    ]);
    if (!result || !result.ok || !result.answer.match) {
      return { candidate: { ...candidate }, lookups: 1, failures: result && !result.ok ? 1 : 0, cacheHits: 0 };
    }
    const provisional = {
      productName: result.answer.match.productName,
      brand: result.answer.match.brand,
      packaging: result.answer.match.packaging,
      confidence: result.answer.match.confidence,
      source: result.answer.match.source,
    };
    const score = identityScore(candidate, provisional);
    if (score < 0) return { candidate: { ...candidate }, lookups: 1, failures: 0, cacheHits: 0 };
    const hint = hintFrom(result.answer.match, score);
    return { candidate: { ...candidate, imageUrl: hint.imageUrl, identity: hint }, lookups: 1, failures: 0, cacheHits: 0 };
  } catch {
    return { candidate: { ...candidate }, lookups: 1, failures: 1, cacheHits: 0 };
  }
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

/**
 * Enrich visual candidates with unrestricted name-search identity hints.
 * Uses cache first, then bounded concurrent lookups under an overall deadline.
 * Does not assign EAN/nutrition. Failures leave vision claims unchanged.
 */
export async function enrichCandidates(
  candidates: VisualCandidate[],
  lookup: LookupApi | undefined,
  options: { signal?: AbortSignal } = {},
): Promise<IdentityEnrichment> {
  if (!lookup || candidates.length === 0) {
    return { candidates: candidates.map((candidate) => ({ ...candidate })), lookups: 0, failures: 0, cacheHits: 0 };
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort);
  const deadline = setTimeout(() => controller.abort(), OVERALL_DEADLINE_MS);

  try {
    const slice = candidates.slice(0, MAX_LOOKUPS);
    const settled = await mapPool(slice, CONCURRENCY, (candidate) => enrichOne(candidate, lookup, controller.signal));
    let lookups = 0;
    let failures = 0;
    let cacheHits = 0;
    const enriched = settled.map((entry) => {
      lookups += entry.lookups;
      failures += entry.failures;
      cacheHits += entry.cacheHits;
      return entry.candidate;
    });
    for (const candidate of candidates.slice(MAX_LOOKUPS)) enriched.push({ ...candidate });

    // Keep vision order so a strong neighbour-ad image match cannot outrank the intended product.
    // identity.score remains available for evidence-based UI ranking within that list.
    return { candidates: enriched, lookups, failures, cacheHits };
  } finally {
    clearTimeout(deadline);
    options.signal?.removeEventListener("abort", onAbort);
  }
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
    ean: only.ean ?? product.ean,
    confidence: only.confidence,
    inferredFields: only.inferredFields.length ? only.inferredFields : product.inferredFields,
  };
}
