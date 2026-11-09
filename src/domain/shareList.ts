import { productById } from "../data/catalog";
import { SHARE_URL } from "./share";
import { isCategoryId } from "./categories";
import { canonicalEan } from "./ean";
import { isRetailer, type RetailerId } from "./retailers";
import type { Adventure, AdventureItem, CategoryId, SavedItem, SavedList } from "./types";

/**
 * Compact shopping-list payload for temporary short links (`/l/{id}`).
 * The server stores a snapshot for 48 hours; anyone with the link can open it.
 */

export const SHARE_LIST_VERSION = 1 as const;
/** Keep in sync with server SHARED_LIST_MAX_ITEMS. */
export const SHARE_LIST_MAX_ITEMS = 100;
export const SHARE_LIST_MAX_NAME = 40;
export const SHARE_LIST_MAX_PACKAGE = 24;

export type SharedListItemV1 = {
  name: string;
  quantity: number;
  category: CategoryId;
  productId?: string;
  brand?: string;
  packageSize?: string;
  ean?: string;
  kind?: "custom_generic";
  icon?: string;
};

export type SharedListV1 = {
  version: 1;
  name?: string;
  retailer?: RetailerId;
  items: SharedListItemV1[];
};

export type ShareListSource = Pick<Adventure, "name" | "retailer" | "items"> | Pick<SavedList, "name" | "retailer" | "items">;

export type ToSharedListResult =
  | { status: "ok"; list: SharedListV1 }
  | { status: "error"; code: "empty" | "too-many" | "invalid" };

function clip(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function shareableProductId(item: Pick<AdventureItem | SavedItem, "productId" | "kind">): string | undefined {
  if (!item.productId) return undefined;
  if (item.kind === "custom_generic" || item.productId.startsWith("custom:")) return item.productId.slice(0, 80);
  return productById(item.productId) ? item.productId : undefined;
}

function shareableIcon(item: Pick<AdventureItem | SavedItem, "icon" | "productId">): string | undefined {
  const icon = item.icon?.trim();
  if (!icon || icon === "unknown") return undefined;
  if (icon === item.productId) return undefined;
  return icon.slice(0, 60);
}

function shareItem(item: AdventureItem | SavedItem): SharedListItemV1 | null {
  const name = clip(item.name ?? "", SHARE_LIST_MAX_NAME);
  if (!name || !isCategoryId(item.category)) return null;
  const quantity = Math.trunc(Number(item.quantity));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 24) return null;
  const shared: SharedListItemV1 = { name, quantity, category: item.category };
  const productId = shareableProductId(item);
  if (productId) shared.productId = productId;
  const brand = item.brand ? clip(item.brand, SHARE_LIST_MAX_NAME) : "";
  if (brand) shared.brand = brand;
  const packageSize = item.packageSize ? clip(item.packageSize, SHARE_LIST_MAX_PACKAGE) : "";
  if (packageSize) shared.packageSize = packageSize;
  const ean = item.ean ? canonicalEan(item.ean) : null;
  if (ean) shared.ean = ean;
  if (item.kind === "custom_generic") shared.kind = "custom_generic";
  const icon = shareableIcon(item);
  if (icon) shared.icon = icon;
  return shared;
}

/** Strip an adventure or saved list down to the allowlisted share schema. Never truncates or skips rows. */
export function toSharedList(source: ShareListSource): ToSharedListResult {
  if (!source.items.length) return { status: "error", code: "empty" };
  if (source.items.length > SHARE_LIST_MAX_ITEMS) return { status: "error", code: "too-many" };

  const items: SharedListItemV1[] = [];
  for (const item of source.items) {
    const shared = shareItem(item);
    if (!shared) return { status: "error", code: "invalid" };
    items.push(shared);
  }

  const name = clip(source.name ?? "", SHARE_LIST_MAX_NAME);
  const retailer = source.retailer && isRetailer(source.retailer) ? source.retailer : undefined;
  return {
    status: "ok",
    list: {
      version: SHARE_LIST_VERSION,
      ...(name && name !== "Boodschappenlijst" && name !== "Voorbeeldlijst" && { name }),
      ...(retailer && { retailer }),
      items,
    },
  };
}

/** Public page URL for a short share id. */
export function sharedListPageUrl(id: string): string {
  return `${SHARE_URL}/l/${id}`;
}

/** Parse `/l/{id}` from a pathname. */
export function shareIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/l\/([A-Za-z0-9_-]{16,64})\/?$/);
  return match?.[1] ?? null;
}

/** Rewrite Umami page URLs so share tokens never leave the device. */
export function sanitizeAnalyticsUrl(url: string): string {
  try {
    const parsed = new URL(url, "https://www.karrie.eu");
    if (/^\/l\/[A-Za-z0-9_-]{16,64}\/?$/.test(parsed.pathname)) {
      parsed.pathname = "/l";
      parsed.search = "";
      parsed.hash = "";
      return `${parsed.pathname}`;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || url;
  } catch {
    return url.replace(/\/l\/[A-Za-z0-9_-]{16,64}\/?/g, "/l");
  }
}

/** Local SavedItems for import: fresh identity fields only, no photos or recognition. */
export function toImportSavedItems(list: SharedListV1): SavedItem[] {
  return list.items.map((item) => {
    const productId = item.productId ?? `shared:${item.category}:${item.name.toLowerCase()}`;
    const icon = item.icon ?? (productById(productId)?.illustration ?? productById(productId)?.id) ?? "unknown";
    const saved: SavedItem = {
      productId,
      name: item.name,
      icon,
      category: item.category,
      quantity: item.quantity,
      ...(item.brand && { brand: item.brand }),
      ...(item.packageSize && { packageSize: item.packageSize }),
      ...(item.ean && { ean: item.ean }),
      ...(item.kind === "custom_generic" && { kind: "custom_generic" }),
      imageKind: "generic",
      imageChoice: "drawing",
    };
    return saved;
  });
}
