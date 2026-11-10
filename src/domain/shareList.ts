import { productById } from "../data/catalog";
import { SHARE_URL } from "./share";
import { isCategoryId } from "./categories";
import { canonicalEan } from "./ean";
import { isRetailer, type RetailerId } from "./retailers";
import type { Adventure, AdventureItem, CategoryId, PackInfo, SavedItem, SavedList } from "./types";

/**
 * Compact shopping-list payload for temporary short links (`/l/{id}`).
 * The server stores a snapshot for 48 hours; anyone with the link can open it.
 */

export const SHARE_LIST_VERSION = 1 as const;
/** Keep in sync with server SHARED_LIST_MAX_ITEMS. */
export const SHARE_LIST_MAX_ITEMS = 100;
export const SHARE_LIST_MAX_NAME = 40;
export const SHARE_LIST_MAX_PACKAGE = 24;
export const SHARE_LIST_MAX_VARIANT = 40;
/** Home/import title when a shared snapshot has no custom name (not the generic Boodschappenlijst default). */
export const SHARED_IMPORT_LIST_NAME = "Gedeeld lijstje";

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
  /** Flavour/variant when known on the sender; never a guess. */
  variant?: string;
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

/** Bundled kebab, central PG shapes (b-/n-/pl-/c-), or custom: — never photo:/shared:/UUID. */
const CENTRAL_ID = /^(?:b|n|pl|c)-[a-z0-9]+$/i;
const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isShareableProductId(productId: string, kind?: SavedItem["kind"]): boolean {
  const id = productId.trim();
  if (!id || id.length > 80) return false;
  if (kind === "custom_generic" || id.startsWith("custom:")) return true;
  if (id.startsWith("photo:") || id.startsWith("shared:")) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return false;
  if (productById(id)) return true;
  return CENTRAL_ID.test(id) || KEBAB_ID.test(id);
}

function shareableProductId(item: Pick<AdventureItem | SavedItem, "productId" | "kind" | "catalogProductId">): string | undefined {
  // Prefer confirmed central identity on the wire so recipients reuse the same catalog row.
  const central = item.catalogProductId?.trim();
  if (central && isShareableProductId(central, item.kind)) return central.slice(0, 80);
  if (!item.productId) return undefined;
  if (!isShareableProductId(item.productId, item.kind)) return undefined;
  return item.productId.trim().slice(0, 80);
}

function shareableIcon(item: Pick<AdventureItem | SavedItem, "icon" | "productId" | "catalogProductId">): string | undefined {
  const icon = item.icon?.trim();
  if (!icon || icon === "unknown") return undefined;
  if (icon === item.productId || icon === item.catalogProductId) return undefined;
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
  const variant = item.recognition?.variant ? clip(item.recognition.variant, SHARE_LIST_MAX_VARIANT) : "";
  if (variant) shared.variant = variant;
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

/** Public share URL (`/s/{id}` → Open Graph preview, then into the app at `/l/{id}`). */
export function sharedListPageUrl(id: string): string {
  return `${SHARE_URL}/s/${id}`;
}

/** Parse `/l/{id}` or share-preview `/s/{id}` from a pathname. */
export function shareIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/(?:l|s)\/([A-Za-z0-9_-]{16,64})\/?$/);
  return match?.[1] ?? null;
}

/** Rewrite Umami page URLs so share tokens never leave the device. */
export function sanitizeAnalyticsUrl(url: string): string {
  try {
    const parsed = new URL(url, "https://www.karrie.eu");
    if (/^\/(?:l|s)\/[A-Za-z0-9_-]{16,64}\/?$/.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.startsWith("/s/") ? "/s" : "/l";
      parsed.search = "";
      parsed.hash = "";
      return `${parsed.pathname}`;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || url;
  } catch {
    return url.replace(/\/(?:l|s)\/[A-Za-z0-9_-]{16,64}\/?/g, (path) => (path.startsWith("/s/") ? "/s" : "/l"));
  }
}

type ShareImageFields = Pick<PackInfo, "ean" | "brand" | "imageChoice" | "kind" | "source">;

/**
 * Clear a forced drawing lock when the item has a resolvable commercial identity (EAN or brand),
 * and restore a share/barcode source so identityOf treats the pack as branded.
 * True generics keep drawing.
 */
export function normalizeSharedImageChoice<T extends ShareImageFields>(item: T): T {
  const brand = item.brand?.trim();
  if (!item.ean && !brand) return item;
  const unlocked =
    item.imageChoice === "drawing"
      ? (() => {
          const { imageChoice: _drop, ...rest } = item;
          return rest;
        })()
      : item;
  if (unlocked.source) return unlocked as T;
  return { ...unlocked, source: item.ean ? ("barcode" as const) : ("shared" as const) } as T;
}

/** Local SavedItems for import: identity for lookups, never personal photos or recognition blobs. */
export function toImportSavedItems(list: SharedListV1): SavedItem[] {
  return list.items.map((item) => {
    const productId = item.productId ?? `shared:${item.category}:${item.name.toLowerCase()}`;
    const icon = item.icon ?? (productById(productId)?.illustration ?? productById(productId)?.id) ?? "unknown";
    const ean = item.ean ? canonicalEan(item.ean) ?? item.ean : undefined;
    const brand = item.brand?.trim() || undefined;
    const commercial = Boolean(ean || brand);
    const saved: SavedItem = {
      productId,
      name: item.name,
      icon,
      category: item.category,
      quantity: item.quantity,
      ...(brand && { brand }),
      ...(item.packageSize && { packageSize: item.packageSize }),
      ...(ean && { ean }),
      ...(item.kind === "custom_generic" && { kind: "custom_generic" }),
      imageKind: "generic",
      ...(commercial
        ? {
            source: ean ? ("barcode" as const) : ("shared" as const),
            ...(item.variant && {
              recognition: { variant: item.variant, confidence: "medium" as const },
            }),
          }
        : { imageChoice: "drawing" as const }),
    };
    return normalizeSharedImageChoice(saved);
  });
}
