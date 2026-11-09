import { productById } from "../data/catalog";
import { SHARE_URL } from "./share";
import { isCategoryId } from "./categories";
import { canonicalEan } from "./ean";
import { isRetailer, type RetailerId } from "./retailers";
import type { Adventure, AdventureItem, CategoryId, SavedItem, SavedList } from "./types";

/**
 * Compact, versioned shopping-list payload for `#list=` share links.
 * Encoding is not encryption: anyone with the full URL can decode the list.
 * Some apps may strip URL fragments; there is no query-param fallback (would hit server logs).
 */

export const SHARE_LIST_VERSION = 1 as const;
export const SHARE_LIST_MAX_ITEMS = 40;
export const SHARE_LIST_MAX_NAME = 40;
export const SHARE_LIST_MAX_PACKAGE = 24;
export const SHARE_LIST_LINK_MAX = 6000;
export const SHARE_LIST_QR_MAX = 1200;
export const SHARE_LIST_HASH_PREFIX = "#list=";

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

export type EncodeResult = { ok: true; payload: string; url: string } | { ok: false; code: "empty" | "too-large" | "encode-failed" };

export type DecodeResult =
  | { ok: true; list: SharedListV1 }
  | { ok: false; code: "missing" | "malformed" | "unsupported" | "invalid" | "too-large" };

type WireItem = {
  n: string;
  q: number;
  c: string;
  p?: string;
  b?: string;
  s?: string;
  e?: string;
  k?: "custom_generic";
  i?: string;
};

type WireList = {
  v: 1;
  n?: string;
  r?: string;
  i: WireItem[];
};

function clip(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function textOf(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function blobOf(bytes: Uint8Array): Blob {
  return new Blob([bytes.slice().buffer]);
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = blobOf(bytes).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const stream = blobOf(bytes).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
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

/** Strip an adventure or saved list down to the allowlisted share schema. */
export function toSharedList(source: ShareListSource): SharedListV1 | null {
  const items: SharedListItemV1[] = [];
  for (const item of source.items.slice(0, SHARE_LIST_MAX_ITEMS)) {
    const name = clip(item.name ?? "", SHARE_LIST_MAX_NAME);
    if (!name || !isCategoryId(item.category)) continue;
    const quantity = Math.trunc(Number(item.quantity));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 24) continue;
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
    items.push(shared);
  }
  if (!items.length) return null;
  const name = clip(source.name ?? "", SHARE_LIST_MAX_NAME);
  const retailer = source.retailer && isRetailer(source.retailer) ? source.retailer : undefined;
  return {
    version: SHARE_LIST_VERSION,
    ...(name && name !== "Boodschappenlijst" && name !== "Voorbeeldlijst" && { name }),
    ...(retailer && { retailer }),
    items,
  };
}

function toWire(list: SharedListV1): WireList {
  return {
    v: 1,
    ...(list.name && { n: list.name }),
    ...(list.retailer && { r: list.retailer }),
    i: list.items.map((item) => ({
      n: item.name,
      q: item.quantity,
      c: item.category,
      ...(item.productId && { p: item.productId }),
      ...(item.brand && { b: item.brand }),
      ...(item.packageSize && { s: item.packageSize }),
      ...(item.ean && { e: item.ean }),
      ...(item.kind === "custom_generic" && { k: "custom_generic" as const }),
      ...(item.icon && { i: item.icon }),
    })),
  };
}

function fromWireItem(raw: unknown): SharedListItemV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const name = typeof row.n === "string" ? clip(row.n, SHARE_LIST_MAX_NAME) : "";
  const quantity = typeof row.q === "number" ? Math.trunc(row.q) : NaN;
  if (!name || !isCategoryId(row.c) || !Number.isFinite(quantity) || quantity < 1 || quantity > 24) return null;
  const item: SharedListItemV1 = { name, quantity, category: row.c };
  if (typeof row.p === "string" && row.p.trim()) {
    const productId = row.p.trim().slice(0, 80);
    if (productId.startsWith("custom:") || productById(productId)) item.productId = productId;
  }
  if (typeof row.b === "string" && clip(row.b, SHARE_LIST_MAX_NAME)) item.brand = clip(row.b, SHARE_LIST_MAX_NAME);
  if (typeof row.s === "string" && clip(row.s, SHARE_LIST_MAX_PACKAGE)) item.packageSize = clip(row.s, SHARE_LIST_MAX_PACKAGE);
  if (typeof row.e === "string") {
    const ean = canonicalEan(row.e);
    if (ean) item.ean = ean;
  }
  if (row.k === "custom_generic") item.kind = "custom_generic";
  if (typeof row.i === "string" && row.i.trim() && row.i.trim() !== "unknown") item.icon = row.i.trim().slice(0, 60);
  return item;
}

function fromWire(raw: unknown): SharedListV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.v !== 1) return null;
  if (!Array.isArray(row.i) || row.i.length === 0 || row.i.length > SHARE_LIST_MAX_ITEMS) return null;
  const items = row.i.map(fromWireItem).filter((item): item is SharedListItemV1 => Boolean(item));
  if (!items.length || items.length !== row.i.length) return null;
  const name = typeof row.n === "string" ? clip(row.n, SHARE_LIST_MAX_NAME) : "";
  const retailer = isRetailer(row.r) ? row.r : undefined;
  return {
    version: 1,
    ...(name && { name }),
    ...(retailer && { retailer }),
    items,
  };
}

/** Encode a shared list into a URL fragment payload (`0.` raw or `1.` compressed). */
export async function encodeSharedList(list: SharedListV1): Promise<EncodeResult> {
  if (!list.items.length) return { ok: false, code: "empty" };
  try {
    const json = JSON.stringify(toWire(list));
    const raw = bytesOf(json);
    const compressed = await deflate(raw);
    const useCompressed = compressed && compressed.length < raw.length;
    const body = useCompressed ? compressed! : raw;
    const payload = `${useCompressed ? "1" : "0"}.${toBase64Url(body)}`;
    if (payload.length > SHARE_LIST_LINK_MAX) return { ok: false, code: "too-large" };
    return { ok: true, payload, url: sharedListUrl(payload) };
  } catch {
    return { ok: false, code: "encode-failed" };
  }
}

export function sharedListUrl(payload: string): string {
  return `${SHARE_URL}/${SHARE_LIST_HASH_PREFIX}${payload}`;
}

export function canEncodeForQr(payload: string): boolean {
  return payload.length > 0 && payload.length <= SHARE_LIST_QR_MAX;
}

/** Decode and validate a `#list=` payload or full URL. */
export async function decodeSharedList(input: string): Promise<DecodeResult> {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, code: "missing" };
  if (trimmed.length > SHARE_LIST_LINK_MAX + SHARE_URL.length + 20) return { ok: false, code: "too-large" };

  let payload = trimmed;
  try {
    if (trimmed.includes("#list=")) payload = trimmed.slice(trimmed.indexOf("#list=") + SHARE_LIST_HASH_PREFIX.length);
    else if (trimmed.startsWith("list=")) payload = trimmed.slice(5);
  } catch {
    return { ok: false, code: "malformed" };
  }
  payload = payload.replace(/^#/, "");
  if (!payload) return { ok: false, code: "missing" };
  if (payload.length > SHARE_LIST_LINK_MAX) return { ok: false, code: "too-large" };

  const mode = payload[0];
  if ((mode !== "0" && mode !== "1") || payload[1] !== ".") return { ok: false, code: "malformed" };
  const body = fromBase64Url(payload.slice(2));
  if (!body) return { ok: false, code: "malformed" };

  let jsonBytes = body;
  if (mode === "1") {
    const inflated = await inflate(body);
    if (!inflated) return { ok: false, code: "malformed" };
    jsonBytes = inflated;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textOf(jsonBytes));
  } catch {
    return { ok: false, code: "malformed" };
  }

  if (!parsed || typeof parsed !== "object" || !("v" in parsed)) return { ok: false, code: "malformed" };
  if ((parsed as { v: unknown }).v !== 1) return { ok: false, code: "unsupported" };
  const list = fromWire(parsed);
  if (!list) return { ok: false, code: "invalid" };
  return { ok: true, list };
}

/** Extract `#list=` payload from a location hash (`#list=…`). */
export function payloadFromHash(hash: string): string | null {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!value.startsWith("list=")) return null;
  const payload = value.slice(5);
  return payload || null;
}

export function clearListHash(): void {
  if (typeof window === "undefined") return;
  const url = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(window.history.state, "", url);
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
