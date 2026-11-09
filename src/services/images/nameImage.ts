import { CATEGORIES } from "../../domain/categories";
import { parseNameImageLookupKey } from "../../domain/imageIdentity";
import { isRetailer, retailerName, type RetailerId } from "../../domain/retailers";
import type { CategoryId, NamePhoto } from "../../domain/types";
import type { LookupOutcome } from "../../storage/lookupStore";
import { RETAILER_IMAGE_HOSTS } from "./storeImage";

/**
 * Mirrors the server's answer for a typed product name: a link to a retailer photo (through PrijsProfeet) or an
 * Open Food Facts photo of the same brand and formulation. Never a barcode, nutrition or a pack size for the item.
 */
export type { NamePhoto };

export type NameAnswer = {
  classification: "branded" | "unknown";
  brand?: string;
  variant?: string;
  match: NamePhoto | null;
  alternatives: NamePhoto[];
  /** Private-label examples for the shopping supermarket only; never other chains. */
  privateLabelAlternatives?: NamePhoto[];
  category?: CategoryId;
};

export type NameImageOutcome = LookupOutcome<NameAnswer>;

export const NAME_IMAGE_CLIENT_RULES = { timeoutMs: 45_000, alternatives: 6 };

const OFF_HOST = "images.openfoodfacts.org";
const LIMIT_CODES = new Set(["rate-limited", "daily-limit", "budget"]);
const CATEGORY_IDS = new Set<string>(CATEGORIES.map((category) => category.id));

const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : undefined);

function https(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 600) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url : null;
  } catch {
    return null;
  }
}

/** Checked again here: a retailer photo only from that retailer's image host, an Open Food Facts photo only from theirs. */
export function cleanNamePhoto(value: unknown): NamePhoto | null {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const image = https(raw.imageUrl);
  const productName = text(raw.productName, 120);
  if (!image || !productName) return null;
  let retailer: RetailerId | undefined;
  if (raw.source === "prijsprofeet") {
    if (!isRetailer(raw.retailer)) return null;
    const allowed = RETAILER_IMAGE_HOSTS[raw.retailer];
    if (image.hostname !== allowed.host || !image.pathname.startsWith(allowed.path)) return null;
    retailer = raw.retailer;
  } else if (raw.source !== "off" || image.hostname !== OFF_HOST) return null;
  const page = https(raw.sourceUrl);
  const packaging = text(raw.packaging, 40);
  return {
    source: raw.source,
    imageUrl: image.href,
    productName,
    ...(retailer && { retailer }),
    ...(page && { sourceUrl: page.href }),
    ...(packaging && { packaging }),
  };
}

export function cleanNameAnswer(value: unknown): NameAnswer | null {
  const raw = (value && typeof value === "object" ? value : null) as Record<string, unknown> | null;
  if (!raw || (raw.classification !== "branded" && raw.classification !== "unknown")) return null;
  const brand = text(raw.brand, 40);
  const variant = text(raw.variant, 40);
  const match = raw.match ? cleanNamePhoto(raw.match) : null;
  const alternatives = (Array.isArray(raw.alternatives) ? raw.alternatives : [])
    .slice(0, NAME_IMAGE_CLIENT_RULES.alternatives)
    .map(cleanNamePhoto)
    .filter((photo): photo is NamePhoto => Boolean(photo));
  const privateLabelAlternatives = (Array.isArray(raw.privateLabelAlternatives) ? raw.privateLabelAlternatives : [])
    .slice(0, NAME_IMAGE_CLIENT_RULES.alternatives)
    .map(cleanNamePhoto)
    .filter((photo): photo is NamePhoto => Boolean(photo));
  const category = typeof raw.category === "string" && CATEGORY_IDS.has(raw.category) ? (raw.category as CategoryId) : undefined;
  const branded = raw.classification === "branded" && Boolean(brand);
  return {
    classification: branded ? "branded" : "unknown",
    ...(branded && { brand }),
    ...(branded && variant && { variant }),
    match: branded ? match : null,
    alternatives: branded ? alternatives : [],
    ...(privateLabelAlternatives.length > 0 && { privateLabelAlternatives }),
    ...(category && { category }),
  };
}

/** "Foto: Albert Heijn, via PrijsProfeet" or "Foto: Open Food Facts (CC BY-SA)", always marked as an example. */
export function namePhotoCredit(photo: Pick<NamePhoto, "source" | "retailer">): string {
  const from = photo.source === "off" ? "Open Food Facts (CC BY-SA)" : `${photo.retailer ? retailerName(photo.retailer) : "supermarkt"}, via PrijsProfeet`;
  return `Foto: ${from} · een voorbeeld van dit product.`;
}

export type NameImageClientDeps = { fetch: typeof fetch; online: () => boolean; origin: string };

const UNKNOWN: NameAnswer = { classification: "unknown", match: null, alternatives: [] };

export function createNameImageClient(deps: NameImageClientDeps) {
  return {
    /** Lookup key may include `|r|{retailer}` for private-label scoping (see nameImageLookupKey). */
    async find(key: string): Promise<NameImageOutcome> {
      if (!deps.online()) return { status: "offline" };
      const { name, retailer } = parseNameImageLookupKey(key);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), NAME_IMAGE_CLIENT_RULES.timeoutMs);
      try {
        const response = await deps.fetch(`${deps.origin.replace(/\/$/, "")}/api/images/name`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, ...(retailer && { retailer }) }),
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as { status?: string; code?: string; result?: unknown } | null;
        if (response.ok && body?.status === "ok") {
          const answer = cleanNameAnswer(body.result);
          return answer ? { status: "ok", image: answer } : { status: "error", code: "malformed" };
        }
        /** A name the server refuses, or a server without name search: nothing to find, the generic path goes on. */
        if (response.status === 422 || response.status === 404 || (response.status === 503 && body?.code === "misconfigured")) return { status: "ok", image: UNKNOWN };
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

export type NameImageClient = ReturnType<typeof createNameImageClient>;

export const nameImageClient = createNameImageClient({
  fetch: (...args) => fetch(...args),
  online: () => typeof navigator === "undefined" || navigator.onLine,
  origin: import.meta.env.VITE_API_ORIGIN ?? "",
});
