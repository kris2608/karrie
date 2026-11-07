import type { MatchConfidence, MatchType, Offer, OfferAnswer, OfferProduct, OfferRow } from "../../domain/offers";
import { isRetailer, type RetailerId } from "../../domain/retailers";

export type OfferOutcome =
  | { status: "ok"; answer: OfferAnswer }
  | { status: "offline" }
  | { status: "limit"; code: string }
  | { status: "error"; code: string };

export const OFFER_CLIENT_RULES = { timeoutMs: 15_000 };

const LIMIT_CODES = new Set(["rate-limited", "daily-limit", "budget"]);
const MATCH_TYPES: MatchType[] = ["exact", "likely", "none", "unknown"];

export type OfferClientDeps = {
  fetch: typeof fetch;
  online: () => boolean;
  origin: string;
  now: () => number;
};

const isText = (value: unknown, max = 300): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const isAmount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Keeps only fields of the expected shape, so an odd answer can never break a screen. */
export function cleanOffer(value: unknown, matchType: "exact" | "likely", matchConfidence: MatchConfidence, fetchedAt: string): Offer | null {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  if (!isText(raw.sourceProductId, 200) || !isText(raw.productName) || !isRetailer(raw.retailer) || !isText(raw.promotionStatus, 40)) return null;
  const pick = (key: keyof OfferRow, check: (entry: unknown) => boolean) => (check(raw[key]) ? { [key]: raw[key] } : {}) as Partial<OfferRow>;
  const day = (entry: unknown) => typeof entry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry);
  const flag = (entry: unknown) => typeof entry === "boolean";
  const url = (entry: unknown) => typeof entry === "string" && entry.startsWith("https://") && entry.length < 600;
  return {
    retailer: raw.retailer,
    sourceProductId: raw.sourceProductId,
    productName: raw.productName,
    promotionStatus: raw.promotionStatus,
    ...pick("brand", isText),
    ...pick("ean", (entry) => typeof entry === "string" && /^\d{8,14}$/.test(entry)),
    ...pick("quantity", isText),
    ...pick("promotionalPrice", isAmount),
    ...pick("originalPrice", isAmount),
    ...pick("unitPrice", isAmount),
    ...pick("priceUnit", isText),
    ...pick("promotionMechanism", isText),
    ...pick("promotionText", isText),
    ...pick("multiBuyQuantity", (entry) => Number.isInteger(entry) && (entry as number) > 0),
    ...pick("multiBuyPrice", isAmount),
    ...pick("loyaltyPrice", isAmount),
    ...pick("loyaltyProgram", isText),
    ...pick("inStoreOnly", flag),
    ...pick("onlineOnly", flag),
    ...pick("maxPerCustomer", (entry) => Number.isInteger(entry) && (entry as number) > 0),
    ...pick("validFrom", day),
    ...pick("validUntil", day),
    ...pick("validUntilEstimated", flag),
    ...pick("sourceUrl", url),
    matchType,
    matchConfidence,
    fetchedAt,
  };
}

export function parseAnswer(body: unknown, now: number): OfferAnswer | null {
  const raw = body as { status?: unknown; match?: { matchType?: unknown; matchConfidence?: unknown; offer?: unknown }; fetchedAt?: unknown } | null;
  const matchType = raw?.match?.matchType as MatchType;
  if (raw?.status !== "ok" || !MATCH_TYPES.includes(matchType)) return null;
  const fetchedAt = typeof raw.fetchedAt === "string" && !Number.isNaN(Date.parse(raw.fetchedAt)) ? raw.fetchedAt : new Date(now).toISOString();
  if (matchType !== "exact" && matchType !== "likely") return { matchType, fetchedAt };
  const confidence = raw.match?.matchConfidence === "high" ? "high" : "medium";
  const offer = cleanOffer(raw.match?.offer, matchType, confidence, fetchedAt);
  return offer ? { matchType, offer, fetchedAt } : { matchType: "unknown", fetchedAt };
}

export function createOfferClient(deps: OfferClientDeps) {
  return {
    /** findOffers(product, retailer): only the product's name, kind and barcode are sent. */
    async find(product: OfferProduct, retailer: RetailerId): Promise<OfferOutcome> {
      if (!deps.online()) return { status: "offline" };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OFFER_CLIENT_RULES.timeoutMs);
      try {
        const response = await deps.fetch(`${deps.origin}/api/offers/match`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ retailer, product }),
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as { code?: string } | null;
        const answer = response.ok ? parseAnswer(body, deps.now()) : null;
        if (answer) return { status: "ok", answer };
        const code = body?.code ?? `http-${response.status}`;
        return LIMIT_CODES.has(code) || response.status === 429 ? { status: "limit", code } : { status: "error", code };
      } catch {
        if (controller.signal.aborted) return { status: "error", code: "timeout" };
        return deps.online() ? { status: "error", code: "unreachable" } : { status: "offline" };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export type OfferClient = ReturnType<typeof createOfferClient>;

export const offersClient = createOfferClient({
  fetch: (...args) => fetch(...args),
  online: () => navigator.onLine,
  origin: import.meta.env.VITE_API_ORIGIN ?? "",
  now: Date.now,
});
