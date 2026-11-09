export type RetailerId = "jumbo" | "albert_heijn" | "lidl";

export type Retailer = { id: RetailerId; name: string; short: string };

export const RETAILERS: readonly Retailer[] = [
  { id: "jumbo", name: "Jumbo", short: "Jumbo" },
  { id: "albert_heijn", name: "Albert Heijn", short: "AH" },
  { id: "lidl", name: "Lidl", short: "Lidl" },
];

export function isRetailer(value: unknown): value is RetailerId {
  return RETAILERS.some((retailer) => retailer.id === value);
}

export function retailerName(id: RetailerId): string {
  return RETAILERS.find((retailer) => retailer.id === id)?.name ?? id;
}

/** Retailers whose product photos Karrie may link to (mirrors the server allowlist). */
export const IMAGE_SOURCE_RETAILERS = ["jumbo", "albert_heijn", "lidl", "plus", "dirk", "hoogvliet", "dekamarkt", "poiesz"] as const;
export type ImageSourceRetailerId = (typeof IMAGE_SOURCE_RETAILERS)[number];

export function isImageSourceRetailer(value: unknown): value is ImageSourceRetailerId {
  return typeof value === "string" && (IMAGE_SOURCE_RETAILERS as readonly string[]).includes(value);
}

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

export function imageRetailerName(id: string): string {
  return isImageSourceRetailer(id) ? IMAGE_RETAILER_NAMES[id] : id.replace(/_/g, " ");
}

/** The short code anonymous statistics use. */
export function analyticsRetailer(id: RetailerId): "jumbo" | "ah" | "lidl" {
  return id === "albert_heijn" ? "ah" : id;
}

const HOUSE_BRAND_MARKERS: { match: RegExp; retailer: RetailerId }[] = [
  { match: /^(ah|albert\s*heijn)\b/i, retailer: "albert_heijn" },
  { match: /^jumbo\b/i, retailer: "jumbo" },
  { match: /^lidl\b/i, retailer: "lidl" },
];

/** Detect an observed private-label chain from a brand or product name; unknown brands return undefined. */
export function houseBrandRetailer(...parts: (string | undefined)[]): RetailerId | undefined {
  for (const part of parts) {
    const text = part?.trim();
    if (!text) continue;
    for (const entry of HOUSE_BRAND_MARKERS) {
      if (entry.match.test(text)) return entry.retailer;
    }
  }
  return undefined;
}
