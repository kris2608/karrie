import { z } from "zod";
import type { Fetch } from "../images.js";

/**
 * PrijsProfeet's free product search (https://www.prijsprofeet.nl/api/docs). Only `/search` is used:
 * the `/match/*`, shelf-price and price-history endpoints are paid and stay out of this adapter.
 */
export const PRIJSPROFEET_RULES = {
  origin: "https://www.prijsprofeet.nl",
  pageSize: 20,
  timeoutMs: 8_000,
  perMinute: 60,
  eanPerDay: 400,
  maxPauseMs: 10 * 60_000,
} as const;

export const RETAILERS = ["jumbo", "albert_heijn", "lidl"] as const;
export type RetailerId = (typeof RETAILERS)[number];

/** One promoted product as the app shows it; prices in euros. */
export type OfferRow = {
  retailer: RetailerId;
  sourceProductId: string;
  productName: string;
  brand?: string;
  ean?: string;
  privateLabel?: boolean;
  category?: string;
  quantity?: string;
  promotionStatus: string;
  promotionalPrice?: number;
  originalPrice?: number;
  unitPrice?: number;
  priceUnit?: string;
  promotionMechanism?: string;
  promotionText?: string;
  multiBuyQuantity?: number;
  multiBuyPrice?: number;
  loyaltyPrice?: number;
  loyaltyProgram?: string;
  inStoreOnly?: boolean;
  onlineOnly?: boolean;
  maxPerCustomer?: number;
  validFrom?: string;
  validUntil?: string;
  validUntilEstimated?: boolean;
  sourceUrl?: string;
};

export type SearchResult =
  | { ok: true; rows: OfferRow[] }
  | { ok: false; code: "limit" | "ean-limit" | "unavailable" };

export type ProviderStats = { calls: number; failures: number; limited: number; eanToday: number; pausedUntil?: string };

export type PrijsProfeetConfig = {
  userAgent: string;
  apiKey?: string;
  perMinute?: number;
  eanPerDay?: number;
};

const text = z.string().trim().min(1).max(300).nullish().catch(undefined);
const amount = z.number().finite().nonnegative().max(10_000).nullish().catch(undefined);
const count = z.number().int().positive().max(100).nullish().catch(undefined);
const flag = z.boolean().nullish().catch(undefined);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullish().catch(undefined);

const RowSchema = z.object({
  product_id: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(300),
  brand: text,
  ean: z.string().regex(/^\d{8,14}$/).nullish().catch(undefined),
  private_label: flag,
  unified_category: text,
  quantity: text,
  price: amount,
  original_price: amount,
  unit_price: amount,
  unit: text,
  retailer: z.enum(RETAILERS),
  promotion_status: z.string().max(40).nullish().catch(undefined),
  promotion_type: text,
  promotional_keywords: z.array(z.string().max(200)).max(20).nullish().catch(undefined),
  multi_buy_quantity: count,
  multi_buy_price: amount,
  loyalty_price: amount,
  loyalty_program: text,
  in_store_only: flag,
  online_only: flag,
  max_per_customer: count,
  valid_from: day,
  valid_until: day,
  valid_until_estimated: flag,
  product_url: text,
});

const SearchSchema = z.object({ results: z.array(z.unknown()).max(200) });

type Row = z.infer<typeof RowSchema>;

function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null)) as T;
}

function httpsUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function toOfferRow(row: Row): OfferRow {
  return defined({
    retailer: row.retailer,
    sourceProductId: row.product_id,
    productName: row.name,
    brand: row.brand ?? undefined,
    ean: row.ean ?? undefined,
    privateLabel: row.private_label ?? undefined,
    category: row.unified_category ?? undefined,
    quantity: row.quantity ?? undefined,
    promotionStatus: row.promotion_status ?? "unknown",
    promotionalPrice: row.price ?? undefined,
    originalPrice: row.original_price ?? undefined,
    unitPrice: row.unit_price ?? undefined,
    priceUnit: row.unit ?? undefined,
    promotionMechanism: row.promotion_type ?? undefined,
    promotionText: row.promotional_keywords?.find((keyword) => keyword.trim())?.trim(),
    multiBuyQuantity: row.multi_buy_quantity ?? undefined,
    multiBuyPrice: row.multi_buy_price ?? undefined,
    loyaltyPrice: row.loyalty_price ?? undefined,
    loyaltyProgram: row.loyalty_program ?? undefined,
    inStoreOnly: row.in_store_only ?? undefined,
    onlineOnly: row.online_only ?? undefined,
    maxPerCustomer: row.max_per_customer ?? undefined,
    validFrom: row.valid_from?.slice(0, 10),
    validUntil: row.valid_until?.slice(0, 10),
    validUntilEstimated: row.valid_until_estimated ?? undefined,
    sourceUrl: httpsUrl(row.product_url),
  });
}

/** Rows that fail validation are skipped one by one, so one odd product never hides the rest. */
export function parseSearch(body: unknown): OfferRow[] | null {
  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) return null;
  return parsed.data.results.flatMap((row) => {
    const one = RowSchema.safeParse(row);
    return one.success ? [toOfferRow(one.data)] : [];
  });
}

export function searchUrl(q: string, retailer: RetailerId): string {
  const params = new URLSearchParams({
    q,
    retailer,
    promotion_status: "active",
    page_size: String(PRIJSPROFEET_RULES.pageSize),
  });
  return `${PRIJSPROFEET_RULES.origin}/api/v1/search?${params}`;
}

export function isBareEan(q: string): boolean {
  return /^\d{8,14}$/.test(q.trim());
}

function retryAfter(header: string | null, now: number): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

function amsterdamDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(ms);
}

/**
 * Keeps well under PrijsProfeet's anonymous limits (120 searches per minute, 500 bare-EAN searches per
 * day) for the whole server, and stops calling while a 429 asks it to.
 */
export function createPrijsProfeet(config: PrijsProfeetConfig, fetchImpl: Fetch = fetch, now: () => number = Date.now) {
  const perMinute = config.perMinute ?? PRIJSPROFEET_RULES.perMinute;
  const eanPerDay = config.eanPerDay ?? PRIJSPROFEET_RULES.eanPerDay;
  let recent: number[] = [];
  let pausedUntil = 0;
  let eanDay = "";
  let eanCount = 0;
  const stats = { calls: 0, failures: 0, limited: 0 };

  function headers(): Record<string, string> {
    return {
      "User-Agent": config.userAgent,
      Accept: "application/json",
      ...(config.apiKey && { "X-API-Key": config.apiKey }),
    };
  }

  async function search(q: string, retailer: RetailerId): Promise<SearchResult> {
    const at = now();
    if (at < pausedUntil) return { ok: false, code: "limit" };
    recent = recent.filter((time) => at - time < 60_000);
    if (recent.length >= perMinute) {
      stats.limited += 1;
      return { ok: false, code: "limit" };
    }
    if (isBareEan(q)) {
      const today = amsterdamDay(at);
      if (today !== eanDay) {
        eanDay = today;
        eanCount = 0;
      }
      if (eanCount >= eanPerDay) return { ok: false, code: "ean-limit" };
      eanCount += 1;
    }
    recent.push(at);
    stats.calls += 1;
    try {
      const response = await fetchImpl(searchUrl(q, retailer), {
        headers: headers(),
        signal: AbortSignal.timeout(PRIJSPROFEET_RULES.timeoutMs),
      });
      if (response.status === 429) {
        const wait = retryAfter(response.headers.get("retry-after"), now()) ?? 60_000;
        pausedUntil = now() + Math.min(wait, PRIJSPROFEET_RULES.maxPauseMs);
        stats.limited += 1;
        return { ok: false, code: "limit" };
      }
      if (!response.ok) {
        stats.failures += 1;
        return { ok: false, code: "unavailable" };
      }
      const rows = parseSearch(await response.json());
      if (!rows) {
        stats.failures += 1;
        return { ok: false, code: "unavailable" };
      }
      return { ok: true, rows };
    } catch {
      stats.failures += 1;
      return { ok: false, code: "unavailable" };
    }
  }

  return {
    search,
    stats(): ProviderStats {
      return {
        ...stats,
        eanToday: eanDay === amsterdamDay(now()) ? eanCount : 0,
        ...(pausedUntil > now() && { pausedUntil: new Date(pausedUntil).toISOString() }),
      };
    },
  };
}

export type PrijsProfeet = ReturnType<typeof createPrijsProfeet>;
