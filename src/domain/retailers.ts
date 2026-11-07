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

/** The short code anonymous statistics use. */
export function analyticsRetailer(id: RetailerId): "jumbo" | "ah" | "lidl" {
  return id === "albert_heijn" ? "ah" : id;
}
