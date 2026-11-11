import type { CatalogStore } from "./catalog/types.js";
import {
  isStrictNameMatch,
  matchIdentityName,
  matchName,
  privateLabelImages,
  words,
  type NameImage,
  type NameMatch,
  type NameRow,
} from "./nameMatch.js";
import type { OffSearch } from "./offSearch.js";
import type { OfferRow, PrijsProfeet, RetailerId } from "./offers/prijsprofeet.js";
import { parseIdentityQuery, parseName } from "./productName.js";

export type NameLookupOptions = { retailer?: RetailerId };

/**
 * A picture for a product a parent typed: PrijsProfeet first, then Open Food Facts, with the same rules for both.
 * Only links and attribution travel; nothing here gives the item a barcode, nutrition or a pack size.
 */
export type NameAnswer = NameMatch & {
  searched: { prijsprofeet: Outcome; off: Outcome };
  /** Confirmed Postgres catalog id after a central hit or successful name upsert; never invented. */
  catalogProductId?: string;
};
type Outcome = "match" | "brand" | "none" | "error" | "skipped";

export type NameImageResult = { ok: true; answer: NameAnswer; cached: boolean } | { ok: false; code: "limit" | "unavailable" };

const DAY = 24 * 60 * 60 * 1000;
export const NAME_IMAGE_RULES = {
  foundTtlMs: 7 * DAY,
  missTtlMs: DAY,
  errorTtlMs: 5 * 60 * 1000,
  cacheEntries: 5_000,
  /** Raw search rows, shared by every pack and size of the same name. */
  rowsTtlMs: 6 * 60 * 60 * 1000,
  rowEntries: 500,
  alternatives: 6,
};

export function fromOffer(row: OfferRow): NameRow {
  return {
    source: "prijsprofeet",
    retailer: row.retailer,
    name: row.productName,
    brands: row.brand ? [row.brand] : [],
    ...(row.quantity && { quantity: row.quantity }),
    ...(row.imageUrl && { imageUrl: row.imageUrl }),
    ...(row.sourceUrl && { sourceUrl: row.sourceUrl }),
    ...(row.ean && { ean: row.ean }),
    ...(row.category && { category: row.category }),
    ...(row.privateLabel === true && { privateLabel: true }),
    ...(row.promotionStatus && { promotionStatus: row.promotionStatus }),
    ...(row.approximate === true && { approximate: true }),
  };
}

/** Cache key for photo-identity enrichment (not parent-typed name rules). */
export function identityKey(query: string): string | null {
  const parsed = parseIdentityQuery(query);
  if (!parsed) return null;
  return words(parsed.base).join(" ");
}

/** Cache key for retailer-scoped private-label suggestions. */
export function privateLabelKey(retailer: string, typed: string): string | null {
  const key = nameKey(typed);
  return key ? `private-label|${retailer}|${key}` : null;
}

/** One cache entry for "Chocomel", "chocomel" and "Chocomél"; packaging and size are part of what was asked. */
export function nameKey(typed: string): string | null {
  const parsed = parseName(typed);
  if (!parsed) return null;
  return [words(parsed.base).join(" "), parsed.packaging ?? "", parsed.size ? `${parsed.size.count ?? 1}x${parsed.size.amount}${parsed.size.unit}` : ""].join("|");
}

const outcomeOf = (match: NameMatch): Outcome => (match.match ? "match" : match.classification === "branded" ? "brand" : "none");

function combine(first: NameMatch, second: NameMatch | null, searched: NameAnswer["searched"], privateLabels?: NameImage[]): NameAnswer {
  const branded = first.classification === "branded" ? first : second?.classification === "branded" ? second : null;
  const seen = new Set<string>();
  const alternatives: NameImage[] = [];
  for (const image of [...first.alternatives, ...(second?.alternatives ?? [])]) {
    if (image.privateLabel) continue;
    if (seen.has(image.imageUrl) || image.imageUrl === (first.match ?? second?.match)?.imageUrl) continue;
    seen.add(image.imageUrl);
    alternatives.push(image);
  }
  return {
    classification: branded ? "branded" : "unknown",
    ...(branded?.brand && { brand: branded.brand }),
    ...(branded?.variant && { variant: branded.variant }),
    match: first.match ?? second?.match ?? null,
    alternatives: alternatives.slice(0, NAME_IMAGE_RULES.alternatives),
    ...(privateLabels && privateLabels.length > 0 && { privateLabelAlternatives: privateLabels }),
    ...((first.category ?? second?.category) && { category: first.category ?? second?.category }),
    searched,
  };
}

type Entry = { result: NameImageResult; until: number };
type Rows = { rows: NameRow[]; failed?: "limit" | "unavailable" };

export function createNameImageLookup(
  providers: { prijsProfeet?: Pick<PrijsProfeet, "searchName" | "searchPrivateLabel">; off?: Pick<OffSearch, "search"> },
  now: () => number = Date.now,
  catalog?: Pick<CatalogStore, "byAlias" | "upsertNameImages" | "cacheGet" | "cachePut" | "rememberSeen">,
) {
  const cache = new Map<string, Entry>();
  const pending = new Map<string, Promise<NameImageResult>>();
  const plCache = new Map<string, { images: NameImage[]; until: number }>();
  const rows = new Map<string, { answer: Rows; until: number }>();
  const loading = new Map<string, Promise<Rows>>();
  const stats = { hits: 0, misses: 0 };

  function remember(key: string, result: NameImageResult, ttl: number) {
    cache.delete(key);
    if (cache.size >= NAME_IMAGE_RULES.cacheEntries) cache.delete(cache.keys().next().value as string);
    cache.set(key, { result, until: now() + ttl });
  }

  /** "Chocomel", "Chocomel blik" and "Chocomel 1 liter" search the same word; one upstream call answers all three. */
  function rowsOnce(id: string, load: () => Promise<Rows>): Promise<Rows> {
    const hit = rows.get(id);
    if (hit && hit.until > now()) return Promise.resolve(hit.answer);
    const running = loading.get(id);
    if (running) return running;
    const promise = load()
      .then((answer) => {
        if (!answer.failed) {
          rows.delete(id);
          if (rows.size >= NAME_IMAGE_RULES.rowEntries) rows.delete(rows.keys().next().value as string);
          rows.set(id, { answer, until: now() + NAME_IMAGE_RULES.rowsTtlMs });
        }
        return answer;
      })
      .finally(() => loading.delete(id));
    loading.set(id, promise);
    return promise;
  }

  function prijsProfeetRows(query: string, typed: string, identity = false): Promise<Rows> {
    const provider = providers.prijsProfeet;
    if (!provider) return Promise.resolve({ rows: [] });
    const matchFn = identity ? matchIdentityName : matchName;
    return rowsOnce(`pp|${query}`, async () => {
      const answer = await provider.searchName(query, (collected) => isStrictNameMatch(matchFn(typed, collected.map(fromOffer))));
      if (!answer.ok) return { rows: [], failed: answer.code === "unavailable" ? "unavailable" : "limit" };
      return { rows: answer.rows.map(fromOffer) };
    });
  }

  const plPending = new Map<string, Promise<NameImage[]>>();

  function rememberPrivateLabels(key: string, images: NameImage[]) {
    const ttl = images.length ? NAME_IMAGE_RULES.foundTtlMs : NAME_IMAGE_RULES.missTtlMs;
    plCache.delete(key);
    if (plCache.size >= NAME_IMAGE_RULES.cacheEntries) plCache.delete(plCache.keys().next().value as string);
    plCache.set(key, { images, until: now() + ttl });
    if (catalog) void catalog.cachePut(key, "name", { privateLabelAlternatives: images }, now() + ttl);
  }

  async function loadPrivateLabels(typed: string, retailer: RetailerId, seed: NameRow[]): Promise<NameImage[]> {
    const key = privateLabelKey(retailer, typed);
    if (!key) return [];
    const hit = plCache.get(key);
    if (hit && hit.until > now()) return hit.images;
    const running = plPending.get(key);
    if (running) return running;
    const promise = (async () => {
      const cached = await catalog?.cacheGet<{ privateLabelAlternatives?: NameImage[] }>(key).catch(() => null);
      if (cached?.privateLabelAlternatives) {
        rememberPrivateLabels(key, cached.privateLabelAlternatives);
        return cached.privateLabelAlternatives;
      }
      let images = privateLabelImages(typed, seed, retailer);
      if (images.length === 0 && providers.prijsProfeet?.searchPrivateLabel) {
        const answer = await providers.prijsProfeet.searchPrivateLabel(words(parseName(typed)!.base).join(" "), retailer, (collected) =>
          privateLabelImages(typed, collected.map(fromOffer), retailer).length > 0,
        );
        if (answer.ok) images = privateLabelImages(typed, answer.rows.map(fromOffer), retailer);
      }
      rememberPrivateLabels(key, images);
      return images;
    })().finally(() => plPending.delete(key));
    plPending.set(key, promise);
    return promise;
  }

  function offRows(query: string): Promise<Rows> {
    const provider = providers.off!;
    return rowsOnce(`off|${query}`, async () => {
      const answer = await provider.search(query);
      return answer.ok ? { rows: answer.rows } : { rows: [], failed: answer.code };
    });
  }

  async function fromCatalog(typed: string, key: string): Promise<NameImageResult | null> {
    if (!catalog) return null;
    const parsed = parseName(typed);
    if (!parsed) return null;
    const packRequested = Boolean(parsed.packaging || parsed.size);
    const hit = await catalog.byAlias({ alias: parsed.base, packaging: parsed.packaging, size: parsed.size }).catch(() => null);
    if (hit && !hit.packMatched) return null;
    if (hit?.packMatched && hit.answer.match && (!packRequested || hit.exactPack)) {
      const answer: NameAnswer = { ...hit.answer, catalogProductId: hit.answer.catalogProductId ?? hit.productId };
      const result: NameImageResult = { ok: true, answer, cached: true };
      remember(key, result, NAME_IMAGE_RULES.foundTtlMs);
      void catalog.rememberSeen(hit.productId);
      return result;
    }
    const cachedAnswer = await catalog.cacheGet<NameAnswer>(`name:${key}`).catch(() => null);
    if (cachedAnswer) {
      const result: NameImageResult = { ok: true, answer: cachedAnswer, cached: true };
      remember(key, result, cachedAnswer.match ? NAME_IMAGE_RULES.foundTtlMs : NAME_IMAGE_RULES.missTtlMs);
      return result;
    }
    return null;
  }

  async function searchProviders(
    typed: string,
    query: string,
    identity: boolean,
    retailer?: RetailerId,
  ): Promise<{ answer: NameAnswer; failed?: "limit"; offPaused?: boolean }> {
    const matchFn = identity ? matchIdentityName : matchName;
    const first = await prijsProfeetRows(query, typed, identity);
    if (first.failed === "limit") return { answer: { classification: "unknown", match: null, alternatives: [], searched: { prijsprofeet: "error", off: "skipped" } }, failed: "limit" };
    let found = first.rows;
    let matched = matchFn(typed, found, retailer);
    const brandWord = query.split(" ")[0];
    if (!first.failed && matched.classification === "unknown" && query.includes(" ")) {
      const again = await prijsProfeetRows(brandWord, typed, identity);
      if (again.failed === "limit") return { answer: { classification: "unknown", match: null, alternatives: [], searched: { prijsprofeet: "error", off: "skipped" } }, failed: "limit" };
      found = [...found, ...again.rows];
      matched = matchFn(typed, found, retailer);
    }
    const searched: NameAnswer["searched"] = { prijsprofeet: first.failed ? "error" : outcomeOf(matched), off: "skipped" };
    let second: NameMatch | null = null;
    let offPaused = false;
    /** OFF runs when there is no strict PP match (miss, brand-only, or approximate-only). */
    if (!isStrictNameMatch(matched) && providers.off) {
      const off = await offRows(query);
      if (!off.failed) {
        second = matchFn(typed, off.rows, retailer);
        searched.off = outcomeOf(second);
      } else {
        searched.off = "error";
        offPaused = off.failed === "limit";
      }
    }
    const labels = !identity && retailer ? await loadPrivateLabels(typed, retailer, found) : undefined;
    const answer = combine(matched, second, searched, labels);
    return { answer, offPaused };
  }

  async function fresh(typed: string, key: string, retailer?: RetailerId): Promise<NameImageResult> {
    const central = await fromCatalog(typed, key);
    if (central) {
      if (!retailer || !central.ok) return central;
      const labels = await loadPrivateLabels(typed, retailer, []);
      return { ...central, answer: { ...central.answer, ...(labels.length > 0 && { privateLabelAlternatives: labels }) } };
    }
    const parsed = parseName(typed)!;
    const query = words(parsed.base).join(" ");
    const { answer, failed, offPaused } = await searchProviders(typed, query, false, retailer);
    if (failed === "limit") return { ok: false, code: "limit" };
    if (!answer.match && (answer.searched.prijsprofeet === "error" || answer.searched.off === "error") && !(answer.privateLabelAlternatives?.length)) {
      const result: NameImageResult = { ok: false, code: "unavailable" };
      /** Our own pause on Open Food Facts asked nothing; the next request may try again. */
      if (answer.searched.prijsprofeet === "error" || !offPaused) remember(key, result, NAME_IMAGE_RULES.errorTtlMs);
      return result;
    }
    let storeable: NameAnswer = { ...answer };
    delete storeable.privateLabelAlternatives;
    if (catalog && storeable.match && !storeable.match.approximate && storeable.classification === "branded" && storeable.brand) {
      const ids = await catalog.upsertNameImages({ typed, answer: storeable }).catch(() => null);
      if (ids?.productId) storeable = { ...storeable, catalogProductId: ids.productId };
    }
    const ttl = storeable.match ? NAME_IMAGE_RULES.foundTtlMs : NAME_IMAGE_RULES.missTtlMs;
    remember(key, { ok: true, answer: storeable, cached: false }, ttl);
    if (catalog) void catalog.cachePut(`name:${key}`, "name", storeable, now() + ttl);
    return { ok: true, answer: { ...answer, ...(storeable.catalogProductId && { catalogProductId: storeable.catalogProductId }) }, cached: false };
  }

  async function freshIdentity(typed: string, key: string): Promise<NameImageResult> {
    const cacheId = `identity:${key}`;
    const cachedAnswer = catalog ? await catalog.cacheGet<NameAnswer>(cacheId).catch(() => null) : null;
    if (cachedAnswer) {
      const result: NameImageResult = { ok: true, answer: cachedAnswer, cached: true };
      remember(cacheId, result, cachedAnswer.match ? NAME_IMAGE_RULES.foundTtlMs : NAME_IMAGE_RULES.missTtlMs);
      return result;
    }
    const parsed = parseIdentityQuery(typed);
    if (!parsed) {
      return {
        ok: true,
        answer: { classification: "unknown", match: null, alternatives: [], searched: { prijsprofeet: "skipped", off: "skipped" } },
        cached: false,
      };
    }
    const query = words(parsed.base).join(" ");
    const { answer, failed, offPaused } = await searchProviders(typed, query, true);
    if (failed === "limit") return { ok: false, code: "limit" };
    if (!answer.match && !answer.alternatives.length && (answer.searched.prijsprofeet === "error" || answer.searched.off === "error")) {
      const result: NameImageResult = { ok: false, code: "unavailable" };
      if (answer.searched.prijsprofeet === "error" || !offPaused) remember(cacheId, result, NAME_IMAGE_RULES.errorTtlMs);
      return result;
    }
    let storeable: NameAnswer = { ...answer };
    delete storeable.privateLabelAlternatives;
    /**
     * Strict branded matches are shared into the catalog so later scans reuse images without
     * another PP/OFF round-trip. Approximate / brand-only hits stay cache-only (not confirmed SKUs).
     * Never assigns an EAN from a name match.
     */
    if (catalog && storeable.match && !storeable.match.approximate && storeable.classification === "branded" && storeable.brand) {
      const ids = await catalog.upsertNameImages({ typed, answer: storeable }).catch(() => null);
      if (ids?.productId) storeable = { ...storeable, catalogProductId: ids.productId };
    }
    const ttl = storeable.match ? NAME_IMAGE_RULES.foundTtlMs : NAME_IMAGE_RULES.missTtlMs;
    remember(cacheId, { ok: true, answer: storeable, cached: false }, ttl);
    if (catalog) void catalog.cachePut(cacheId, "name", storeable, now() + ttl);
    return { ok: true, answer: storeable, cached: false };
  }

  /** A cached answer or a remembered recent error, or nothing; never searches. */
  function cached(typed: string): NameImageResult | null {
    const key = nameKey(typed);
    const entry = key ? cache.get(key) : undefined;
    if (!entry || entry.until <= now()) return null;
    return entry.result.ok ? { ...entry.result, cached: true } : entry.result;
  }

  function cachedIdentity(query: string): NameImageResult | null {
    const key = identityKey(query);
    if (!key) return null;
    const entry = cache.get(`identity:${key}`);
    if (!entry || entry.until <= now()) return null;
    return entry.result.ok ? { ...entry.result, cached: true } : entry.result;
  }

  async function withPrivateLabels(typed: string, result: NameImageResult, retailer?: RetailerId): Promise<NameImageResult> {
    if (!retailer || !result.ok) return result;
    const labels = await loadPrivateLabels(typed, retailer, []);
    if (!labels.length) return result;
    return { ...result, answer: { ...result.answer, privateLabelAlternatives: labels } };
  }

  return {
    cached,
    cachedIdentity,
    find(typed: string, options: NameLookupOptions = {}): Promise<NameImageResult> {
      const key = nameKey(typed);
      if (!key) {
        return Promise.resolve({
          ok: true,
          answer: { classification: "unknown", match: null, alternatives: [], searched: { prijsprofeet: "skipped", off: "skipped" } },
          cached: false,
        });
      }
      const known = cached(typed);
      if (known) {
        stats.hits += 1;
        return withPrivateLabels(typed, known, options.retailer);
      }
      const running = pending.get(key);
      if (running) return running.then((result) => withPrivateLabels(typed, result, options.retailer));
      stats.misses += 1;
      const promise = fresh(typed, key, options.retailer).finally(() => pending.delete(key));
      pending.set(key, promise);
      return promise;
    },
    /**
     * Photo-identity enrichment: bypasses parent-typed name length/word gates, treats approximate PP
     * hits as non-terminal, and consults OFF when there is no strict PP match. Never upserts EANs.
     */
    findIdentity(query: string): Promise<NameImageResult> {
      const key = identityKey(query);
      if (!key) {
        return Promise.resolve({
          ok: true,
          answer: { classification: "unknown", match: null, alternatives: [], searched: { prijsprofeet: "skipped", off: "skipped" } },
          cached: false,
        });
      }
      const cacheId = `identity:${key}`;
      const known = cachedIdentity(query);
      if (known) {
        stats.hits += 1;
        return Promise.resolve(known);
      }
      const running = pending.get(cacheId);
      if (running) return running;
      stats.misses += 1;
      const promise = freshIdentity(query, key).finally(() => pending.delete(cacheId));
      pending.set(cacheId, promise);
      return promise;
    },
    /**
     * Private-label alternatives only: memory → PostgreSQL → PrijsProfeet. Never runs a branded name search
     * or records a candidate. Concurrent lookups for the same key share one upstream call.
     */
    async privateLabels(typed: string, retailer: RetailerId): Promise<NameImageResult> {
      const key = privateLabelKey(retailer, typed);
      if (!key) {
        return {
          ok: true,
          answer: { classification: "unknown", match: null, alternatives: [], searched: { prijsprofeet: "skipped", off: "skipped" } },
          cached: false,
        };
      }
      const hit = plCache.get(key);
      const fromMemory = Boolean(hit && hit.until > now());
      const images = await loadPrivateLabels(typed, retailer, []);
      return {
        ok: true,
        answer: {
          classification: "unknown",
          match: null,
          alternatives: [],
          ...(images.length > 0 && { privateLabelAlternatives: images }),
          searched: { prijsprofeet: images.length ? "match" : "none", off: "skipped" },
        },
        cached: fromMemory,
      };
    },
    stats: () => ({ ...stats, entries: cache.size }),
  };
}

export type NameImageLookup = ReturnType<typeof createNameImageLookup>;
