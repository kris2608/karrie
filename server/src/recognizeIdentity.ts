import type { NameImageLookup, NameImageResult } from "./nameImage.js";
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
  approximate?: boolean;
};

export type EnrichedCandidate = VisualCandidate & {
  /** Supporting pack photo from unrestricted name search; not proof of exact SKU. */
  imageUrl?: string;
  identity?: IdentityHint;
  /** Confirmed Postgres catalog id from a strict name upsert or central hit; never invented. */
  catalogProductId?: string;
};

export type IdentityEnrichment = {
  candidates: EnrichedCandidate[];
  lookups: number;
  failures: number;
  cacheHits: number;
};

const CONFLICT =
  /\b(?:gerasp(?:t|te)|rasp|blok|stuk|oud|jong|belegen|drink|smoothie|filet|steak|salame|speciale|aardbei|kers|mango|passie|naturel|paprika|classic|classics|almond|amandel|caramel|karamel|chocolate|chocolade|vanilla|vanille|double|mini|color|colour|wit|white|zwart|black|roze|pink)\b/gi;

const FLAVOUR =
  /\b(aardbei|kers|mango|passie|salame|speciale|naturel|paprika|bbq|bolognese|onion|classic|almond|amandel|caramel|karamel|chocolate|chocolade|vanilla|vanille|gold|billionaire)\b/i;

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function conflictTokens(text: string): string[] {
  return [...text.matchAll(CONFLICT)].map((match) => match[0].toLowerCase());
}

/** Strip pack sizes / multipack counts so they are not stuffed into the search `q`. */
export function stripSizeTokens(text: string): string {
  return text
    .replace(/\b\d{1,2}\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:ml|cl|dl|l|ltr|liter|g|gr|gram|kg)\b/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|cl|dl|l|ltr|liter|g|gr|gram|kg)\b/gi, " ")
    .replace(/\b\d{1,2}\s*[x×]\s*\d+\b/gi, " ")
    .replace(/\b\d+\s*stuks?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function packCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const multi = text.match(/\b(\d{1,2})\s*[x×]/i) ?? text.match(/\b(\d{1,2})\s*stuks?\b/i);
  if (!multi) return null;
  const n = Number(multi[1]);
  return n > 1 ? n : null;
}

/** Primary display query (no size) for logging / single-query callers. */
export function identityQuery(candidate: Pick<VisualCandidate, "brand" | "productName" | "genericName" | "variant" | "packageSize">): string {
  return identityQueries(candidate)[0] ?? "";
}

/**
 * Progressive search strings for a visual candidate.
 * Package size is omitted from `q` and applied only when scoring/filtering.
 */
export function identityQueries(
  candidate: Pick<VisualCandidate, "brand" | "productName" | "genericName" | "variant" | "packageSize"> &
    Partial<Pick<VisualCandidate, "catalogType">>,
): string[] {
  const brand = candidate.brand?.trim() ?? "";
  const title = stripSizeTokens((candidate.productName ?? "").trim());
  const generic = stripSizeTokens((candidate.genericName ?? "").trim());
  const variant = stripSizeTokens((candidate.variant ?? "").trim());
  const catalogType = (candidate.catalogType ?? "").trim();

  const withBrand = (parts: string[]) => {
    const body = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (!body) return brand;
    if (brand && !body.toLowerCase().includes(brand.toLowerCase())) return `${brand} ${body}`.replace(/\s+/g, " ").trim();
    return body;
  };

  const titleWords = title.split(/\s+/).filter(Boolean);
  const exact = withBrand([title, variant && title && !title.toLowerCase().includes(variant.toLowerCase()) ? variant : ""]);
  const broader =
    titleWords.length > 2
      ? withBrand([titleWords.slice(0, Math.min(3, titleWords.length - (variant ? 1 : 0))).join(" ")])
      : withBrand([titleWords.slice(0, 2).join(" ") || title]);
  const brandGeneric = withBrand([generic || catalogType].filter((part) => part && (!title || !title.toLowerCase().includes(part.toLowerCase()))));

  const out: string[] = [];
  for (const query of [exact, broader, brandGeneric, brand]) {
    const tidy = query.replace(/\s+/g, " ").trim();
    if (tidy && !out.some((existing) => existing.toLowerCase() === tidy.toLowerCase())) out.push(tidy);
  }
  return out;
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
    if (word === "color" || word === "colour" || word === "roze" || word === "pink") {
      if (/\b(white|wit|zwart|black)\b/i.test(providerText) && !/\b(color|colour|roze|pink|kleur)\b/i.test(providerText)) return false;
    }
    if ((word === "mini" || word === "double") && !providerText.includes(word) && FLAVOUR.test(providerText)) {
      const visionHas = visionText.includes(word);
      if (visionHas && !normalize(hint.productName).includes(word) && !normalize(hint.packaging).includes(word)) {
        /* soft: scored lower, not hard-reject unless opposite line token present */
      }
    }
  }

  const variant = normalize(candidate.variant);
  if (variant && variant.length >= 3 && !providerText.includes(variant) && !normalize(hint.productName).includes(variant)) {
    const otherFlavour = FLAVOUR.exec(providerText);
    if (otherFlavour && !variant.includes(otherFlavour[0].toLowerCase()) && !visionText.includes(otherFlavour[0].toLowerCase())) {
      return false;
    }
  }

  /** Reject when vision title tokens (e.g. Casa di Mama) share nothing with the provider title (e.g. Ristorante). */
  const visionTitle = normalize(stripSizeTokens([candidate.productName, candidate.genericName].filter(Boolean).join(" ")));
  const titleTokens = visionTitle
    .split(" ")
    .filter((token) => token.length >= 4 && token !== visionBrand && !/^\d/.test(token));
  if (titleTokens.length >= 2) {
    const hits = titleTokens.filter((token) => providerText.includes(token)).length;
    if (hits === 0) return false;
  }

  const visionCount = packCount(candidate.packageSize) ?? packCount(candidate.productName);
  const providerCount = packCount(hint.packaging) ?? packCount(hint.productName);
  if (visionCount && providerCount && visionCount !== providerCount) return false;

  const size = normalize(candidate.packageSize);
  if (size) {
    const amount = size.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b/i);
    if (amount) {
      const providerAmount = providerText.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b/i);
      if (providerAmount) {
        const sameUnit = amount[2].toLowerCase() === providerAmount[2].toLowerCase();
        const sameValue = amount[1].replace(",", ".") === providerAmount[1].replace(",", ".");
        if (sameUnit && !sameValue && !visionCount) return false;
      }
    }
  }
  return true;
}

/** Evidence score for ranking identity hints against a visual candidate. Higher is better. */
export function identityScore(
  candidate: Pick<VisualCandidate, "brand" | "productName" | "genericName" | "variant" | "packageSize" | "confidence">,
  hint: Pick<IdentityHint, "productName" | "brand" | "packaging" | "confidence" | "source" | "approximate">,
): number {
  if (!identityConsistent(candidate, hint)) return -1;
  let score = hint.confidence === "high" ? 4 : 2;
  if (hint.approximate) score -= 3;
  if (hint.source === "prijsprofeet") score += 1;
  const visionBrand = normalize(candidate.brand);
  const hintBrand = normalize(hint.brand);
  if (visionBrand && hintBrand && (visionBrand === hintBrand || visionBrand.includes(hintBrand) || hintBrand.includes(visionBrand))) score += 6;
  const variant = normalize(candidate.variant);
  const providerText = normalize([hint.brand, hint.productName, hint.packaging].filter(Boolean).join(" "));
  if (variant && providerText.includes(variant)) score += 5;
  for (const token of ["mini", "double", "color", "colour"]) {
    if (normalize(candidate.productName).includes(token) || normalize(candidate.variant).includes(token)) {
      if (providerText.includes(token)) score += 2;
      else score -= 1;
    }
  }
  const visionCount = packCount(candidate.packageSize) ?? packCount(candidate.productName);
  const providerCount = packCount(hint.packaging) ?? packCount(hint.productName);
  if (visionCount && providerCount && visionCount === providerCount) score += 3;
  const size = normalize(candidate.packageSize);
  if (size) {
    const amount = size.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b/i);
    if (amount && providerText.includes(`${amount[1].replace(",", ".")} ${amount[2].toLowerCase()}`)) score += 3;
    else if (amount && new RegExp(`${amount[1].replace(",", ".")}\\s*${amount[2]}`, "i").test(providerText)) score += 3;
  }
  const title = normalize(stripSizeTokens(candidate.productName ?? candidate.genericName ?? ""));
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
    ...(image.approximate && { approximate: true }),
  };
}

function bestHint(
  candidate: VisualCandidate,
  result: NameImageResult,
): { hint: IdentityHint; catalogProductId?: string } | null {
  if (!result.ok) return null;
  const images = [result.answer.match, ...result.answer.alternatives].filter((image): image is NameImage => Boolean(image));
  let best: IdentityHint | null = null;
  for (const image of images) {
    const provisional = {
      productName: image.productName,
      brand: image.brand,
      packaging: image.packaging,
      confidence: image.confidence,
      source: image.source,
      approximate: image.approximate,
    };
    const score = identityScore(candidate, provisional);
    if (score < 0) continue;
    const hint = hintFrom(image, score);
    if (!best || hint.score > best.score) best = hint;
  }
  if (!best) return null;
  /** Only attach a catalog id when the winning hint is the strict (non-approximate) match. */
  const catalogProductId =
    result.answer.catalogProductId &&
    result.answer.match &&
    !result.answer.match.approximate &&
    best.imageUrl === result.answer.match.imageUrl
      ? result.answer.catalogProductId
      : undefined;
  return { hint: best, ...(catalogProductId && { catalogProductId }) };
}

/** Stop progressive queries once we have a strong non-approximate hint. */
function isStrongHint(hint: IdentityHint | null): boolean {
  return Boolean(hint && !hint.approximate && hint.confidence === "high" && hint.score >= 12);
}

const MAX_LOOKUPS = 5;
const LOOKUP_TIMEOUT_MS = 3_500;
const OVERALL_DEADLINE_MS = 5_000;
const CONCURRENCY = 3;

type LookupApi = Pick<NameImageLookup, "findIdentity" | "cachedIdentity"> | Pick<NameImageLookup, "find" | "cached">;

function hasIdentityApi(lookup: LookupApi): lookup is Pick<NameImageLookup, "findIdentity" | "cachedIdentity"> {
  return "findIdentity" in lookup && typeof lookup.findIdentity === "function";
}

async function enrichOne(
  candidate: VisualCandidate,
  lookup: LookupApi,
  signal: AbortSignal | undefined,
): Promise<{ candidate: EnrichedCandidate; lookups: number; failures: number; cacheHits: number }> {
  const queries = identityQueries(candidate);
  if (!queries.length || signal?.aborted) return { candidate: { ...candidate }, lookups: 0, failures: 0, cacheHits: 0 };

  let lookups = 0;
  let failures = 0;
  let cacheHits = 0;
  /** Box avoids closure CFA treating `best` as always-null after the loop. */
  const state: { best: IdentityHint | null; catalogProductId?: string } = { best: null };

  const consider = (entry: { hint: IdentityHint; catalogProductId?: string } | null) => {
    if (!entry) return;
    if (!state.best || entry.hint.score > state.best.score) {
      state.best = entry.hint;
      state.catalogProductId = entry.catalogProductId;
    }
  };

  for (const query of queries) {
    if (signal?.aborted) break;

    if (hasIdentityApi(lookup)) {
      const cached = lookup.cachedIdentity?.(query) ?? null;
      if (cached?.ok) {
        cacheHits += 1;
        consider(bestHint(candidate, cached));
        if (isStrongHint(state.best)) break;
        continue;
      }
    } else if ("cached" in lookup) {
      const cached = lookup.cached?.(query) ?? null;
      if (cached?.ok && cached.answer.match) {
        cacheHits += 1;
        consider(bestHint(candidate, cached));
        if (isStrongHint(state.best)) break;
        continue;
      }
    }

    try {
      const findPromise = hasIdentityApi(lookup) ? lookup.findIdentity(query) : "find" in lookup ? lookup.find(query) : Promise.resolve(null);
      const result = await Promise.race([
        findPromise,
        new Promise<null>((resolve) => {
          const timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS);
          signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve(null);
            },
            { once: true },
          );
        }),
      ]);
      lookups += 1;
      if (!result) {
        failures += 1;
        continue;
      }
      if (!result.ok) {
        failures += 1;
        continue;
      }
      consider(bestHint(candidate, result));
      if (isStrongHint(state.best)) break;
    } catch {
      lookups += 1;
      failures += 1;
    }
  }

  if (!state.best) return { candidate: { ...candidate }, lookups, failures, cacheHits };
  return {
    candidate: {
      ...candidate,
      imageUrl: state.best.imageUrl,
      identity: state.best,
      ...(state.catalogProductId && { catalogProductId: state.catalogProductId }),
    },
    lookups,
    failures,
    cacheHits,
  };
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
