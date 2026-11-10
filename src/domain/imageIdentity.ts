import { productById } from "../data/catalog";
import { isRetailer, type RetailerId } from "./retailers";
import { parseName, sizeLabel } from "./typedName";
import type { PackInfo } from "./types";

/** What a reference picture must show. Mirrors ImageIdentitySchema on the server, including its length limits. */
export type ImageIdentity = {
  name: string;
  brand?: string;
  variant?: string;
  size?: string;
  generic: boolean;
  /** A product the parent typed: only pictures are looked up, never facts from shop pages. */
  typed?: boolean;
};

type Identifiable = Pick<PackInfo, "brand" | "packageSize" | "source" | "recognition" | "kind"> & { name: string };
type Pictured = Pick<PackInfo, "imageUrl" | "imageKind" | "imageSource">;

const cut = (value: string | undefined, max: number) => {
  const trimmed = value?.trim().slice(0, max).trim();
  return trimmed || undefined;
};

/** A recognised or barcode-identified branded pack is looked up exactly; everything else as the plain product type. */
export function identityOf(item: Identifiable): ImageIdentity | null {
  const name = cut(item.name, 60);
  if (!name) return null;
  const brand = cut(item.brand, 40);
  if (item.kind === "custom_generic") {
    if (!brand) return { name, generic: true };
    const parsed = parseName(item.name);
    return { name: cut(parsed?.base, 60) ?? name, brand, ...(parsed?.size && { size: sizeLabel(parsed.size) }), generic: false, typed: true };
  }
  const branded =
    (item.source === "vision" && item.recognition?.specific) ||
    item.source === "off" ||
    item.source === "barcode" ||
    item.source === "shared";
  if (branded && brand) {
    return { name, brand, variant: cut(item.recognition?.variant, 40), size: cut(item.packageSize, 20), generic: false };
  }
  return { name, generic: true };
}

/** The front photo Open Food Facts publishes for this exact barcode. */
export function hasOffPhoto(item: Pictured): boolean {
  return item.imageSource === "off" && item.imageKind === "photo" && Boolean(item.imageUrl);
}

/**
 * A scanned pack may have a retailer photo for its exact barcode, even when Open Food Facts already has a front
 * photo. Products without a barcode, and standard products a parent typed in, keep their drawing.
 */
export function wantsStoreImage(item: Pictured & Pick<PackInfo, "ean" | "kind">): boolean {
  return Boolean(item.ean) && item.kind !== "custom_generic";
}

/** A product the parent typed is looked up by its name: a brand may have a retailer or Open Food Facts photo. */
export function wantsNameImage(item: Pick<PackInfo, "ean" | "kind">): boolean {
  return item.kind === "custom_generic" && !item.ean;
}

/** One lookup per typed name, whatever its capitals or spacing; packaging and sizes stay part of it. */
export function nameImageKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLocaleLowerCase("nl");
}

const RETAILER_MARK = "|r|";

/** Device cache key: brand/generic answers stay reusable; with a retailer, private-label suggestions stay isolated. */
export function nameImageLookupKey(name: string, retailer?: RetailerId): string {
  const base = nameImageKey(name);
  return retailer ? `${base}${RETAILER_MARK}${retailer}` : base;
}

export function parseNameImageLookupKey(key: string): { name: string; retailer?: RetailerId } {
  const at = key.lastIndexOf(RETAILER_MARK);
  if (at < 0) return { name: key };
  const retailer = key.slice(at + RETAILER_MARK.length);
  return isRetailer(retailer) ? { name: key.slice(0, at), retailer } : { name: key };
}

const PRIVATE_LABEL_MARK = "private-label|";

/** Strip a known house-brand prefix so "AH Hagelslag Melk" becomes a generic search base. */
function stripHouseBrandPrefix(name: string): string {
  const trimmed = name.replace(/\s+/g, " ").trim();
  const match = /^(ah|albert\s*heijn|jumbo|lidl)\b[\s-]*/i.exec(trimmed);
  if (!match) return trimmed;
  return trimmed.slice(match[0].length).trim() || trimmed;
}

type PrivateLabelItem = Identifiable &
  Pick<PackInfo, "ean" | "privateLabelRetailer"> & {
    productId?: string;
  };

/**
 * The generic product type used when asking for private-label alternatives.
 * Catalog items keep their catalog name; adopted private labels drop the house-brand prefix.
 */
export function privateLabelQuery(item: PrivateLabelItem): string | null {
  if (item.ean) return null;
  if (item.privateLabelRetailer) {
    const stripped = stripHouseBrandPrefix(item.name);
    return stripped || null;
  }
  const catalog = item.productId ? productById(item.productId) : undefined;
  if (catalog) return catalog.name;
  if (item.kind === "custom_generic" && !item.brand) return item.name.trim() || null;
  const identity = identityOf(item);
  if (identity?.generic) return identity.name;
  return null;
}

/** Retailer-scoped private-label suggestions for generic or already-adopted private-label items (never manufacturer brands). */
export function wantsPrivateLabels(item: PrivateLabelItem, retailer: RetailerId | undefined): boolean {
  if (!retailer || item.ean) return false;
  if (item.privateLabelRetailer) return Boolean(privateLabelQuery(item));
  const identity = identityOf(item);
  return Boolean(identity?.generic && privateLabelQuery(item));
}

/** Device + API cache key for private-label-only lookups (`private-label|{retailer}|{name}`). */
export function privateLabelLookupKey(query: string, retailer: RetailerId): string {
  return `${PRIVATE_LABEL_MARK}${retailer}|${nameImageKey(query)}`;
}

export function parsePrivateLabelLookupKey(key: string): { name: string; retailer: RetailerId; purpose: "private-label" } | null {
  if (!key.startsWith(PRIVATE_LABEL_MARK)) return null;
  const rest = key.slice(PRIVATE_LABEL_MARK.length);
  const bar = rest.indexOf("|");
  if (bar < 0) return null;
  const retailer = rest.slice(0, bar);
  const name = rest.slice(bar + 1);
  return isRetailer(retailer) && name ? { name, retailer, purpose: "private-label" } : null;
}

/**
 * Only a recognised branded pack gets a reference picture without asking. Standard products keep their drawing, and
 * a pack with an Open Food Facts front photo keeps that photo, unless a parent picks "Voorbeeldfoto". A retailer
 * photo for the exact barcode already is the "Voorbeeldfoto", so nothing is searched.
 */
export function wantsReference(identity: ImageIdentity | null, choice: PackInfo["imageChoice"], offPhoto = false, storePhoto = false): boolean {
  if (!identity || storePhoto || choice === "photo" || choice === "off" || choice === "drawing") return false;
  return choice === "reference" || (!identity.generic && !offPhoto);
}

function part(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

/** Same key as the server: different brands, variants or sizes never share a picture. */
export function identityKey(identity: ImageIdentity): string {
  return identity.generic ? `g|${part(identity.name)}` : ["p", part(identity.brand), part(identity.name), part(identity.variant), part(identity.size)].join("|");
}
