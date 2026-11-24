import { productById } from "../data/catalog";
import { productHeading } from "./productHeading";

/** Trailing pack size / count that should not be spoken to a toddler. */
const PACK_SIZE =
  /\s*[–—-]?\s*\d+([.,]\d+)?\s*(ml|cl|l|liter|liters|g|gr|gram|grammen|kg|stuks?|st\.?|x)?\b/gi;

/** Leading retailer / house-brand fluff already common in scanned titles. */
const LEADING_FLUFF = /^(ah|jumbo|plus|lidl|aldi|spar|coop|biologisch(?:e)?)\s+/i;

/**
 * Child-friendly name for voice guidance. Prefers catalog names; never reads full retailer titles.
 * Keeps meaningful distinctions (e.g. chocolademelk stays chocolademelk).
 */
export function spokenProductName(item: {
  productId: string;
  name: string;
  brand?: string;
  packageSize?: string;
  kind?: string;
  canonicalName?: string;
}): string {
  const catalog = productById(item.productId);
  if (catalog?.name) return tidy(catalog.name);

  const heading = productHeading({
    name: item.name,
    brand: item.brand,
    packageSize: item.packageSize,
  }).title;

  let spoken = tidy(heading);
  spoken = spoken.replace(PACK_SIZE, " ").replace(/\s+/g, " ").trim();
  spoken = spoken.replace(LEADING_FLUFF, "").trim();

  if (!spoken && item.canonicalName) spoken = tidy(item.canonicalName);
  if (!spoken) spoken = tidy(item.name) || "product";

  // Cap length so TTS stays short; keep the first meaningful words.
  if (spoken.length > 32) {
    const cut = spoken.slice(0, 32);
    const space = cut.lastIndexOf(" ");
    spoken = (space > 12 ? cut.slice(0, space) : cut).trim();
  }

  return spoken;
}

/** Lowercase form used inside a Dutch sentence (except all-caps brands stay as-is). */
export function spokenNameInSentence(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "product";
  if (/^[A-ZÁÉÍÓÚÄËÏÖÜ]{2,}$/.test(trimmed)) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
