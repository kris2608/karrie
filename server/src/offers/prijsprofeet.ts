import { z } from "zod";
import type { Fetch } from "../images.js";

/**
 * PrijsProfeet's free product search (https://www.prijsprofeet.nl/api/docs). Only `/search` is used:
 * the `/match/*`, shelf-price and price-history endpoints are paid and stay out of this adapter.
 */
export const PRIJSPROFEET_RULES = {
  origin: "https://www.prijsprofeet.nl",
  pageSize: 20,
  /** Extra pages for name/image search when page 1 has no adequate match. */
  maxNamePages: 3,
  timeoutMs: 8_000,
  perMinute: 60,
  eanPerDay: 400,
  maxPauseMs: 10 * 60_000,
} as const;

/** Supermarkets the parent can pick for shopping lists and offers. */
export const RETAILERS = ["jumbo", "albert_heijn", "lidl"] as const;
export type RetailerId = (typeof RETAILERS)[number];

export function isRetailer(value: unknown): value is RetailerId {
  return typeof value === "string" && (RETAILERS as readonly string[]).includes(value);
}

/** Any PrijsProfeet retailer slug (jumbo, plus, dirk, …). */
export type SourceRetailer = string;

/**
 * Retailers whose product photos may be used as image sources. Kept separate from the shopping
 * picker; expand only with validated image hosts (never invent hosts).
 */
export const IMAGE_SOURCE_RETAILERS = ["jumbo", "albert_heijn", "lidl", "plus", "dirk", "hoogvliet", "dekamarkt", "poiesz"] as const;
export type ImageSourceRetailerId = (typeof IMAGE_SOURCE_RETAILERS)[number];

export function isImageSourceRetailer(value: unknown): value is ImageSourceRetailerId {
  return typeof value === "string" && (IMAGE_SOURCE_RETAILERS as readonly string[]).includes(value);
}

/** Dutch labels for photo credits; shopping picker names stay in the client retailers module. */
export const IMAGE_RETAILER_NAMES: Record<ImageSourceRetailerId, string> = {
  jumbo: "Jumbo",
  albert_heijn: "Albert Heijn",
  lidl: "Lidl",
  plus: "Plus",
  dirk: "Dirk",
  hoogvliet: "Hoogvliet",
  dekamarkt: "Dekamarkt",
  poiesz: "Poiesz",
};

/**
 * House brands that mark a private-label row. Used for name search scoping; barcode scans keep
 * the scanned product even when it is a house brand.
 */
export const HOUSE_BRANDS: Record<string, readonly string[]> = {
  albert_heijn: ["ah", "albert heijn"],
  jumbo: ["jumbo"],
  lidl: ["lidl"],
  plus: ["plus"],
  dirk: ["1 de beste", "dirk"],
  hoogvliet: ["hoogvliet"],
  dekamarkt: ["dekamarkt", "1 de beste"],
  poiesz: ["poiesz"],
};

/** Prefer shopping-list retailers, then the extended image sources, then everyone else. */
export const RETAILER_RANK: Record<string, number> = {
  albert_heijn: 0,
  jumbo: 1,
  lidl: 2,
  plus: 3,
  dirk: 4,
  hoogvliet: 5,
  dekamarkt: 6,
  poiesz: 7,
};

/** One product row from PrijsProfeet search; prices in euros when present. */
export type OfferRow = {
  retailer: SourceRetailer;
  sourceProductId: string;
  baseProductId?: string;
  productName: string;
  brand?: string;
  ean?: string;
  privateLabel?: boolean;
  category?: string;
  quantity?: string;
  promotionStatus: string;
  approximate?: boolean;
  brandHub?: string;
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
  /** A link to the retailer's own product photo; never copied. */
  imageUrl?: string;
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
const sourceRetailer = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z_]{2,30}$/);

const RowSchema = z.object({
  product_id: z.string().min(1).max(200),
  base_product_id: text,
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
  retailer: sourceRetailer,
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
  approximate: flag,
  brand_hub: text,
  product_url: text,
  image_url: z.string().trim().min(1).max(600).nullish().catch(undefined),
});

const SearchSchema = z.object({
  results: z.array(z.unknown()).max(200),
  approximate: flag,
  brand_hub: text,
});

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

/** Where each image-source retailer serves its product photos; anything else in `image_url` is ignored. */
export const RETAILER_IMAGE_HOSTS: Record<ImageSourceRetailerId, { host: string; path: string }> = {
  albert_heijn: { host: "static.ah.nl", path: "/dam/product/" },
  jumbo: { host: "www.jumbo.com", path: "/dam-images/" },
  lidl: { host: "www.lidl.nl", path: "/assets/" },
  plus: { host: "images.ctfassets.net", path: "/s0lodsnpsezb/" },
  dirk: { host: "web-fileserver.dirk.nl", path: "/artikelen/" },
  hoogvliet: { host: "static.hoogvliet.nl", path: "/" },
  dekamarkt: { host: "web-fileserver.dekamarkt.nl", path: "/" },
  poiesz: { host: "images.poiesz-supermarkten.nl", path: "/" },
};

export function retailerImage(retailer: SourceRetailer, value: string | null | undefined): string | undefined {
  if (!isImageSourceRetailer(retailer)) return undefined;
  const href = httpsUrl(value);
  if (!href) return undefined;
  const url = new URL(href);
  const allowed = RETAILER_IMAGE_HOSTS[retailer];
  return url.hostname === allowed.host && url.pathname.startsWith(allowed.path) && !url.username && !url.password && !url.port ? url.href : undefined;
}

export function imageRetailerName(retailer: SourceRetailer): string {
  return isImageSourceRetailer(retailer) ? IMAGE_RETAILER_NAMES[retailer] : retailer.replace(/_/g, " ");
}

/** True when the row is a house brand for its retailer (flag or known brand name). */
export function isHouseBrandRow(row: Pick<OfferRow, "retailer" | "brand" | "productName" | "privateLabel">): boolean {
  if (row.privateLabel === true) return true;
  const brands = HOUSE_BRANDS[row.retailer];
  if (!brands?.length) return false;
  const text = `${row.brand ?? ""} ${row.productName}`.toLowerCase();
  return brands.some((brand) => text.includes(brand));
}

export function toOfferRow(row: Row): OfferRow {
  return defined({
    retailer: row.retailer,
    sourceProductId: row.product_id,
    baseProductId: row.base_product_id ?? undefined,
    productName: row.name,
    brand: row.brand ?? undefined,
    ean: row.ean ?? undefined,
    privateLabel: row.private_label ?? undefined,
    category: row.unified_category ?? undefined,
    quantity: row.quantity ?? undefined,
    promotionStatus: row.promotion_status ?? "unknown",
    approximate: row.approximate ?? undefined,
    brandHub: row.brand_hub ?? undefined,
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
    imageUrl: retailerImage(row.retailer, row.image_url),
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

/** A product by barcode: every promotion status and every retailer PrijsProfeet knows. */
export function imageSearchUrl(ean: string, page = 1): string {
  const params = new URLSearchParams({
    q: ean,
    page_size: String(PRIJSPROFEET_RULES.pageSize),
    page: String(page),
  });
  return `${PRIJSPROFEET_RULES.origin}/api/v1/search?${params}`;
}

/** A product by typed name: every promotion status and every retailer. */
export function nameSearchUrl(name: string, page = 1): string {
  const params = new URLSearchParams({
    q: name,
    page_size: String(PRIJSPROFEET_RULES.pageSize),
    page: String(page),
  });
  return `${PRIJSPROFEET_RULES.origin}/api/v1/search?${params}`;
}

/** Private-label candidates for one shopping supermarket only. */
export function privateLabelSearchUrl(name: string, retailer: RetailerId, page = 1): string {
  const params = new URLSearchParams({
    q: name,
    retailer,
    page_size: String(PRIJSPROFEET_RULES.pageSize),
    page: String(page),
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

  /** Every call, for offers or photos, shares the same minute ceiling, EAN budget and 429 pause. */
  async function call(url: string, bareEan: boolean): Promise<SearchResult> {
    const at = now();
    if (at < pausedUntil) return { ok: false, code: "limit" };
    recent = recent.filter((time) => at - time < 60_000);
    if (recent.length >= perMinute) {
      stats.limited += 1;
      return { ok: false, code: "limit" };
    }
    if (bareEan) {
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
      const response = await fetchImpl(url, {
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

  /** Fetch up to `maxNamePages`, stopping early when `enough` says the rows are adequate. */
  async function paginated(buildUrl: (page: number) => string, bareEan: boolean, enough?: (rows: OfferRow[]) => boolean): Promise<SearchResult> {
    const rows: OfferRow[] = [];
    for (let page = 1; page <= PRIJSPROFEET_RULES.maxNamePages; page += 1) {
      const answer = await call(buildUrl(page), bareEan && page === 1);
      if (!answer.ok) return rows.length ? { ok: true, rows } : answer;
      rows.push(...answer.rows);
      if (answer.rows.length < PRIJSPROFEET_RULES.pageSize) break;
      if (enough?.(rows)) break;
    }
    return { ok: true, rows };
  }

  return {
    search: (q: string, retailer: RetailerId) => call(searchUrl(q, retailer), isBareEan(q)),
    searchImage: (ean: string) =>
      paginated((page) => imageSearchUrl(ean, page), true, (rows) => rows.some((row) => row.ean)),
    searchName: (name: string, enough?: (rows: OfferRow[]) => boolean) =>
      paginated((page) => nameSearchUrl(name, page), isBareEan(name), enough),
    searchPrivateLabel: (name: string, retailer: RetailerId, enough?: (rows: OfferRow[]) => boolean) =>
      paginated((page) => privateLabelSearchUrl(name, retailer, page), isBareEan(name), enough),
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
