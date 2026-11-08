import type { CatalogStore } from "./catalog/types.js";
import { matchName, words, type NameImage, type NameMatch, type NameRow } from "./nameMatch.js";
import type { OffSearch } from "./offSearch.js";
import type { OfferRow, PrijsProfeet } from "./offers/prijsprofeet.js";
import { parseName } from "./productName.js";

/**
 * A picture for a product a parent typed: PrijsProfeet first, then Open Food Facts, with the same rules for both.
 * Only links and attribution travel; nothing here gives the item a barcode, nutrition or a pack size.
 */
export type NameAnswer = NameMatch & { searched: { prijsprofeet: Outcome; off: Outcome } };
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
  };
}

/** One cache entry for "Chocomel", "chocomel" and "Chocomél"; packaging and size are part of what was asked. */
export function nameKey(typed: string): string | null {
  const parsed = parseName(typed);
  if (!parsed) return null;
  return [words(parsed.base).join(" "), parsed.packaging ?? "", parsed.size ? `${parsed.size.count ?? 1}x${parsed.size.amount}${parsed.size.unit}` : ""].join("|");
}

const outcomeOf = (match: NameMatch): Outcome => (match.match ? "match" : match.classification === "branded" ? "brand" : "none");

function combine(first: NameMatch, second: NameMatch | null, searched: NameAnswer["searched"]): NameAnswer {
  const branded = first.classification === "branded" ? first : second?.classification === "branded" ? second : null;
  const seen = new Set<string>();
  const alternatives: NameImage[] = [];
  for (const image of [...first.alternatives, ...(second?.alternatives ?? [])]) {
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
    ...((first.category ?? second?.category) && { category: first.category ?? second?.category }),
    searched,
  };
}

type Entry = { result: NameImageResult; until: number };
type Rows = { rows: NameRow[]; failed?: "limit" | "unavailable" };

export function createNameImageLookup(
  providers: { prijsProfeet?: Pick<PrijsProfeet, "searchName">; off?: Pick<OffSearch, "search"> },
  now: () => number = Date.now,
  catalog?: Pick<CatalogStore, "byAlias" | "upsertNameImages" | "cacheGet" | "cachePut" | "rememberSeen">,
) {
  const cache = new Map<string, Entry>();
  const pending = new Map<string, Promise<NameImageResult>>();
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

  function prijsProfeetRows(query: string): Promise<Rows> {
    const provider = providers.prijsProfeet;
    if (!provider) return Promise.resolve({ rows: [] });
    return rowsOnce(`pp|${query}`, async () => {
      const answer = await provider.searchName(query);
      if (!answer.ok) return { rows: [], failed: answer.code === "unavailable" ? "unavailable" : "limit" };
      return { rows: answer.rows.map(fromOffer) };
    });
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
    const hit = await catalog.byAlias({ alias: parsed.base, packaging: parsed.packaging, size: parsed.size }).catch(() => null);
    if (hit?.packMatched && hit.answer.match) {
      const result: NameImageResult = { ok: true, answer: hit.answer, cached: true };
      remember(key, result, NAME_IMAGE_RULES.foundTtlMs);
      void catalog.rememberSeen(hit.productId);
      return result;
    }
    if (hit && !hit.packMatched) return null;
    const cachedAnswer = await catalog.cacheGet<NameAnswer>(`name:${key}`).catch(() => null);
    if (cachedAnswer) {
      const result: NameImageResult = { ok: true, answer: cachedAnswer, cached: true };
      remember(key, result, cachedAnswer.match ? NAME_IMAGE_RULES.foundTtlMs : NAME_IMAGE_RULES.missTtlMs);
      return result;
    }
    return null;
  }

  async function fresh(typed: string, key: string): Promise<NameImageResult> {
    const central = await fromCatalog(typed, key);
    if (central) return central;
    const parsed = parseName(typed)!;
    const query = words(parsed.base).join(" ");
    const first = await prijsProfeetRows(query);
    if (first.failed === "limit") return { ok: false, code: "limit" };
    let found = first.rows;
    let matched = matchName(typed, found);
    const brandWord = query.split(" ")[0];
    if (!first.failed && matched.classification === "unknown" && query.includes(" ")) {
      const again = await prijsProfeetRows(brandWord);
      if (again.failed === "limit") return { ok: false, code: "limit" };
      found = [...found, ...again.rows];
      matched = matchName(typed, found);
    }
    const searched: NameAnswer["searched"] = { prijsprofeet: first.failed ? "error" : outcomeOf(matched), off: "skipped" };
    let second: NameMatch | null = null;
    let offPaused = false;
    if (!matched.match && providers.off) {
      const off = await offRows(query);
      if (!off.failed) {
        second = matchName(typed, off.rows);
        searched.off = outcomeOf(second);
      } else {
        searched.off = "error";
        offPaused = off.failed === "limit";
      }
    }
    const answer = combine(matched, second, searched);
    if (!answer.match && (searched.prijsprofeet === "error" || searched.off === "error")) {
      const result: NameImageResult = { ok: false, code: "unavailable" };
      /** Our own pause on Open Food Facts asked nothing; the next request may try again. */
      if (searched.prijsprofeet === "error" || !offPaused) remember(key, result, NAME_IMAGE_RULES.errorTtlMs);
      return result;
    }
    const ttl = answer.match ? NAME_IMAGE_RULES.foundTtlMs : NAME_IMAGE_RULES.missTtlMs;
    remember(key, { ok: true, answer, cached: false }, ttl);
    if (catalog) {
      void catalog.cachePut(`name:${key}`, "name", answer, now() + ttl);
      if (answer.match) void catalog.upsertNameImages({ typed, answer });
    }
    return { ok: true, answer, cached: false };
  }

  /** A cached answer or a remembered recent error, or nothing; never searches. */
  function cached(typed: string): NameImageResult | null {
    const key = nameKey(typed);
    const entry = key ? cache.get(key) : undefined;
    if (!entry || entry.until <= now()) return null;
    return entry.result.ok ? { ...entry.result, cached: true } : entry.result;
  }

  return {
    cached,
    find(typed: string): Promise<NameImageResult> {
      const key = nameKey(typed);
      if (!key) return Promise.resolve({ ok: true, answer: { classification: "unknown", match: null, alternatives: [], searched: { prijsprofeet: "skipped", off: "skipped" } }, cached: false });
      const known = cached(typed);
      if (known) {
        stats.hits += 1;
        return Promise.resolve(known);
      }
      const running = pending.get(key);
      if (running) return running;
      stats.misses += 1;
      const promise = fresh(typed, key).finally(() => pending.delete(key));
      pending.set(key, promise);
      return promise;
    },
    stats: () => ({ ...stats, entries: cache.size }),
  };
}

export type NameImageLookup = ReturnType<typeof createNameImageLookup>;
