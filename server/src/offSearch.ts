import { z } from "zod";
import { offImage } from "./barcode.js";
import type { Fetch } from "./images.js";
import type { NameRow } from "./nameMatch.js";

/**
 * Open Food Facts' product search by name, limited to products sold in the Netherlands. Free and without a key, but
 * slow and sometimes unavailable, and limited to 10 searches a minute; this stays under that for the whole server.
 */
export const OFF_SEARCH_RULES = {
  origin: "https://world.openfoodfacts.org",
  pageSize: 20,
  perMinute: 8,
  timeoutMs: 20_000,
  pauseMs: 30_000,
  retryMs: 1_500,
};

export type OffSearchResult = { ok: true; rows: NameRow[] } | { ok: false; code: "limit" | "unavailable" };

const text = z.string().trim().min(1).max(300).nullish().catch(undefined);
const ProductSchema = z.object({
  code: z.string().regex(/^\d{8,14}$/).nullish().catch(undefined),
  product_name: text,
  product_name_nl: text,
  brands: z.string().max(300).nullish().catch(undefined),
  quantity: z.string().trim().max(60).nullish().catch(undefined),
  image_front_url: z.string().max(600).nullish().catch(undefined),
});
const SearchSchema = z.object({ products: z.array(z.unknown()).max(100) });

export function offSearchUrl(name: string): string {
  const params = new URLSearchParams({
    search_terms: name,
    search_simple: "1",
    json: "1",
    page_size: String(OFF_SEARCH_RULES.pageSize),
    countries_tags_en: "netherlands",
    fields: "code,product_name,product_name_nl,brands,quantity,image_front_url",
  });
  return `${OFF_SEARCH_RULES.origin}/cgi/search.pl?${params}`;
}

/** Rows without a name are skipped; only images.openfoodfacts.org pictures are kept. */
export function parseOffSearch(body: unknown): NameRow[] | null {
  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) return null;
  return parsed.data.products.flatMap((raw): NameRow[] => {
    const one = ProductSchema.safeParse(raw);
    if (!one.success) return [];
    const product = one.data;
    const name = product.product_name_nl ?? product.product_name;
    if (!name) return [];
    const brands = (product.brands ?? "")
      .split(",")
      .map((brand) => brand.trim())
      .filter((brand) => brand.length > 0 && brand.length <= 40)
      .slice(0, 6);
    const imageUrl = offImage(product.image_front_url);
    return [
      {
        source: "off",
        name,
        brands,
        ...(product.quantity && { quantity: product.quantity }),
        ...(imageUrl && { imageUrl }),
        ...(product.code && { ean: product.code, sourceUrl: `${OFF_SEARCH_RULES.origin}/product/${product.code}` }),
      },
    ];
  });
}

export function createOffSearch(config: { userAgent: string; retryMs?: number }, fetchImpl: Fetch = fetch, now: () => number = Date.now) {
  const retryMs = config.retryMs ?? OFF_SEARCH_RULES.retryMs;
  let recent: number[] = [];
  let pausedUntil = 0;
  const stats = { calls: 0, failures: 0, limited: 0 };

  function admit(): boolean {
    const at = now();
    if (at < pausedUntil) return false;
    recent = recent.filter((time) => at - time < 60_000);
    if (recent.length >= OFF_SEARCH_RULES.perMinute) {
      stats.limited += 1;
      return false;
    }
    recent.push(at);
    stats.calls += 1;
    return true;
  }

  const get = (name: string) =>
    fetchImpl(offSearchUrl(name), { headers: { "User-Agent": config.userAgent, Accept: "application/json" }, signal: AbortSignal.timeout(OFF_SEARCH_RULES.timeoutMs) });

  return {
    async search(name: string): Promise<OffSearchResult> {
      if (!admit()) return { ok: false, code: "limit" };
      try {
        let response = await get(name);
        /** Their search often answers one 503 and then works; one more try before pausing. */
        if (response.status === 503) {
          await new Promise((resolve) => setTimeout(resolve, retryMs));
          if (admit()) response = await get(name);
        }
        if (response.status === 429 || response.status === 503) {
          pausedUntil = now() + OFF_SEARCH_RULES.pauseMs;
          stats.failures += 1;
          return { ok: false, code: "unavailable" };
        }
        if (!response.ok) {
          stats.failures += 1;
          return { ok: false, code: "unavailable" };
        }
        const rows = parseOffSearch(await response.json());
        if (!rows) {
          stats.failures += 1;
          return { ok: false, code: "unavailable" };
        }
        return { ok: true, rows };
      } catch {
        stats.failures += 1;
        return { ok: false, code: "unavailable" };
      }
    },
    stats: () => ({ ...stats, ...(pausedUntil > now() && { pausedUntil: new Date(pausedUntil).toISOString() }) }),
  };
}

export type OffSearch = ReturnType<typeof createOffSearch>;
