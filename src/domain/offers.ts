import { productById } from "../data/catalog";
import { canonicalEan } from "./ean";
import { identityKey, identityOf } from "./imageIdentity";
import { retailerName, type RetailerId } from "./retailers";
import type { AdventureItem, CategoryId } from "./types";

export type MatchType = "exact" | "likely" | "none" | "unknown";
export type MatchConfidence = "high" | "medium";

/** What the server sends about one list item; mirrors OfferProduct there, including its length limits. */
export type OfferProduct = {
  name: string;
  aliases?: string[];
  category: CategoryId;
  generic: boolean;
  brand?: string;
  variant?: string;
  size?: string;
  ean?: string;
};

/** One promotion as PrijsProfeet lists it; prices in euros, dates as YYYY-MM-DD. */
export type OfferRow = {
  retailer: RetailerId;
  sourceProductId: string;
  productName: string;
  brand?: string;
  ean?: string;
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

/** The answer for one product at one supermarket, with the fields the app shows. */
export type Offer = OfferRow & { matchType: "exact" | "likely"; matchConfidence: MatchConfidence; fetchedAt: string };
export type OfferAnswer = { matchType: MatchType; offer?: Offer; fetchedAt: string };

export type OfferQuery = { key: string; retailer: RetailerId; product: OfferProduct };

const cut = (value: string | undefined, max: number) => {
  const trimmed = value?.trim().slice(0, max).trim();
  return trimmed || undefined;
};

/** What is asked about a list item: its own name, the catalog's other names, and a scanned barcode. */
export function offerQuery(item: AdventureItem, retailer: RetailerId): OfferQuery | null {
  const identity = identityOf(item);
  if (!identity) return null;
  const catalog = productById(item.productId);
  const names = [catalog?.name, ...(catalog?.aliases ?? [])]
    .map((name) => cut(name, 120))
    .filter((name): name is string => Boolean(name) && name!.toLowerCase() !== identity.name.toLowerCase());
  const aliases = [...new Set(names)].slice(0, 8);
  const ean = item.ean ? (canonicalEan(item.ean) ?? undefined) : undefined;
  const product: OfferProduct = {
    name: identity.name,
    category: item.category,
    generic: identity.generic,
    ...(aliases.length && { aliases }),
    ...(identity.brand && { brand: identity.brand }),
    ...(identity.variant && { variant: identity.variant }),
    ...(identity.size && { size: identity.size }),
    ...(ean && { ean }),
  };
  const key = ean ? `${retailer}|e|${ean}` : `${retailer}|${identityKey(identity)}`;
  return { key, retailer, product };
}

/** Today in the Netherlands as YYYY-MM-DD. */
export function amsterdamToday(now: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(now);
}

/** Only running promotions count; a promotion ends after its last day in the Netherlands. */
export function isCurrent(offer: Pick<OfferRow, "promotionStatus" | "validFrom" | "validUntil">, now: number): boolean {
  if (offer.promotionStatus !== "active") return false;
  const today = amsterdamToday(now);
  if (offer.validUntil && offer.validUntil < today) return false;
  if (offer.validFrom && offer.validFrom > today) return false;
  return true;
}

export type Shown = "deal" | "maybe";

/** "deal" for an exact or confidently likely match, "maybe" for a doubtful one (parent screens only). */
export function shownAs(answer: OfferAnswer | undefined, now: number): Shown | null {
  const offer = answer?.offer;
  if (!offer || !isCurrent(offer, now)) return null;
  if (offer.matchType === "exact" || offer.matchConfidence === "high") return "deal";
  return "maybe";
}

export function euro(amount: number): string {
  return `€${amount.toFixed(2).replace(".", ",")}`;
}

function sentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

/**
 * The promotion in words. Multi-buy and "1+1" deals show their own terms rather than a per-item price,
 * and savings are never computed: the supermarket's own numbers are shown as they are.
 */
export function mechanismText(offer: OfferRow): { headline: string; price?: string; conditions: string[] } {
  const multi = offer.multiBuyQuantity && offer.multiBuyPrice !== undefined && offer.multiBuyQuantity > 1;
  const kind = offer.promotionMechanism;
  let headline: string;
  if (kind === "multi_buy" && multi) headline = `${offer.multiBuyQuantity} voor ${euro(offer.multiBuyPrice!)}`;
  else if (offer.promotionText) headline = sentence(offer.promotionText);
  else if (kind === "one_plus_one") headline = "1 + 1 gratis";
  else headline = "Aanbieding";

  let price: string | undefined;
  const per = kind === "multi_buy" || kind === "one_plus_one" || kind === "volume";
  if (offer.originalPrice !== undefined && (per || offer.promotionalPrice === undefined)) price = `Normaal ${euro(offer.originalPrice)}`;
  else if (offer.promotionalPrice !== undefined && offer.originalPrice !== undefined && offer.promotionalPrice < offer.originalPrice) {
    price = `${euro(offer.promotionalPrice)}, was ${euro(offer.originalPrice)}`;
  } else if (offer.promotionalPrice !== undefined) price = euro(offer.promotionalPrice);

  const conditions: string[] = [];
  if (offer.loyaltyPrice !== undefined) conditions.push(`${euro(offer.loyaltyPrice)} met ${offer.loyaltyProgram ?? "klantenkaart"}`);
  if (offer.onlineOnly) conditions.push("Alleen online");
  if (offer.inStoreOnly) conditions.push("Alleen in de winkel");
  if (offer.maxPerCustomer) conditions.push(`Maximaal ${offer.maxPerCustomer} per klant`);
  return { headline, price, conditions };
}

/** "t/m zondag 10 november", or nothing when the end date is unknown. */
export function validUntilText(offer: Pick<OfferRow, "validUntil" | "validUntilEstimated">): string | undefined {
  if (!offer.validUntil) return undefined;
  const date = new Date(`${offer.validUntil}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  const text = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" }).format(date);
  return `t/m ${text}${offer.validUntilEstimated ? " (verwacht)" : ""}`;
}

/** "2 producten in de aanbieding bij Jumbo". */
export function summaryText(count: number, retailer: RetailerId): string {
  return `${count} ${count === 1 ? "product" : "producten"} in de aanbieding bij ${retailerName(retailer)}`;
}

export const ATTRIBUTION_URL = "https://www.prijsprofeet.nl";
