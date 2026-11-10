import { createHash, randomBytes } from "node:crypto";
import type { PoolLike, Queryable } from "./candidatesPg.js";
import { PRODUCT_CATEGORIES, type ProductCategory } from "./offers/match.js";
import { isRetailer, type RetailerId } from "./offers/prijsprofeet.js";

export const SHARED_LIST_TTL_MS = 48 * 60 * 60 * 1000;
/** Keep in sync with client SHARE_LIST_MAX_ITEMS. */
export const SHARED_LIST_MAX_ITEMS = 100;
export const SHARED_LIST_MAX_NAME = 40;
export const SHARED_LIST_MAX_PACKAGE = 24;
export const SHARED_LIST_ID_BYTES = 12; // 16 base64url chars

export type SharedListItem = {
  name: string;
  quantity: number;
  category: ProductCategory;
  productId?: string;
  brand?: string;
  packageSize?: string;
  ean?: string;
  kind?: "custom_generic";
  icon?: string;
  variant?: string;
};

export type SharedListPayload = {
  version: 1;
  name?: string;
  retailer?: RetailerId;
  items: SharedListItem[];
};

export type SharedListStats = {
  created: number;
  hits: number;
  expired: number;
  missing: number;
  purged: number;
};

export type SharedListCreateResult =
  | { ok: true; id: string; expiresAt: string }
  | { ok: false; code: "empty" | "invalid" | "too-many" | "unavailable" };

export type SharedListStore = {
  create: (raw: unknown) => Promise<SharedListCreateResult>;
  get: (id: string) => Promise<{ ok: true; list: SharedListPayload } | { ok: false; code: "missing" | "expired" | "invalid" | "unavailable" }>;
  purgeExpired: () => Promise<number>;
  stats: () => SharedListStats;
};

type Rows = { rows: Record<string, unknown>[] };

function clip(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function isCategory(value: unknown): value is ProductCategory {
  return typeof value === "string" && (PRODUCT_CATEGORIES as readonly string[]).includes(value);
}

function newId(): string {
  return randomBytes(SHARED_LIST_ID_BYTES).toString("base64url");
}

function isId(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(value);
}

const CENTRAL_ID = /^(?:b|n|pl|c)-[a-z0-9]+$/i;
const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Bundled kebab, central PG shapes, or custom: — never photo:/shared:/UUID. */
export function isShareableProductId(productId: string, kind?: SharedListItem["kind"]): boolean {
  const id = productId.trim();
  if (!id || id.length > 80) return false;
  if (kind === "custom_generic" || id.startsWith("custom:")) return true;
  if (id.startsWith("photo:") || id.startsWith("shared:")) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return false;
  return CENTRAL_ID.test(id) || KEBAB_ID.test(id);
}

export type SanitizeResult =
  | { ok: true; list: SharedListPayload }
  | { ok: false; code: "empty" | "invalid" | "too-many" };

/** Accept the client SharedListV1 shape and drop anything outside the allowlist. */
export function sanitizeSharedList(raw: unknown): SharedListPayload | null {
  const result = sanitizeSharedListResult(raw);
  return result.ok ? result.list : null;
}

export function sanitizeSharedListResult(raw: unknown): SanitizeResult {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid" };
  const row = raw as Record<string, unknown>;
  if (row.version !== 1 && row.version !== undefined) return { ok: false, code: "invalid" };
  if (!Array.isArray(row.items)) return { ok: false, code: "invalid" };
  if (row.items.length === 0) return { ok: false, code: "empty" };
  if (row.items.length > SHARED_LIST_MAX_ITEMS) return { ok: false, code: "too-many" };
  const items: SharedListItem[] = [];
  for (const entry of row.items) {
    if (!entry || typeof entry !== "object") return { ok: false, code: "invalid" };
    const item = entry as Record<string, unknown>;
    const name = typeof item.name === "string" ? clip(item.name, SHARED_LIST_MAX_NAME) : "";
    const quantity = typeof item.quantity === "number" ? Math.trunc(item.quantity) : NaN;
    if (!name || !isCategory(item.category) || !Number.isFinite(quantity) || quantity < 1 || quantity > 24) {
      return { ok: false, code: "invalid" };
    }
    const shared: SharedListItem = { name, quantity, category: item.category };
    const kind = item.kind === "custom_generic" ? ("custom_generic" as const) : undefined;
    if (kind) shared.kind = kind;
    if (typeof item.productId === "string" && isShareableProductId(item.productId, kind)) {
      shared.productId = item.productId.trim().slice(0, 80);
    }
    if (typeof item.brand === "string" && clip(item.brand, SHARED_LIST_MAX_NAME)) shared.brand = clip(item.brand, SHARED_LIST_MAX_NAME);
    if (typeof item.packageSize === "string" && clip(item.packageSize, SHARED_LIST_MAX_PACKAGE)) {
      shared.packageSize = clip(item.packageSize, SHARED_LIST_MAX_PACKAGE);
    }
    if (typeof item.ean === "string" && /^\d{8,14}$/.test(item.ean.trim())) shared.ean = item.ean.trim();
    if (typeof item.icon === "string" && item.icon.trim() && item.icon.trim() !== "unknown") {
      shared.icon = item.icon.trim().slice(0, 60);
    }
    if (typeof item.variant === "string" && clip(item.variant, SHARED_LIST_MAX_NAME)) {
      shared.variant = clip(item.variant, SHARED_LIST_MAX_NAME);
    }
    items.push(shared);
  }
  if (!items.length) return { ok: false, code: "empty" };
  const name = typeof row.name === "string" ? clip(row.name, SHARED_LIST_MAX_NAME) : "";
  const retailer = isRetailer(row.retailer) ? row.retailer : undefined;
  return {
    ok: true,
    list: {
      version: 1,
      ...(name && { name }),
      ...(retailer && { retailer }),
      items,
    },
  };
}

export function contentHashOf(list: SharedListPayload): string {
  return createHash("sha256").update(JSON.stringify(list)).digest("hex");
}

/** Drop productIds that are not custom and not present in catalog_products; keep the rest of the row. */
/** Central PG product ids — keep even when not yet present in catalog_products. */
const CENTRAL_PRODUCT_ID = /^(?:b|n|pl|c)-[a-z0-9]+$/i;

async function dropUnknownCatalogIds(list: SharedListPayload, query: (text: string, values?: unknown[]) => Promise<Rows>): Promise<SharedListPayload> {
  const ids = [
    ...new Set(
      list.items
        .map((item) => item.productId)
        .filter((id): id is string => typeof id === "string" && !id.startsWith("custom:") && !CENTRAL_PRODUCT_ID.test(id)),
    ),
  ];
  if (!ids.length) return list;
  let known: Set<string>;
  try {
    const { rows } = await query(`SELECT id FROM catalog_products WHERE id = ANY($1::text[])`, [ids]);
    known = new Set(rows.map((row) => String(row.id)));
  } catch {
    return list;
  }
  return {
    ...list,
    items: list.items.map((item) => {
      if (!item.productId || item.productId.startsWith("custom:") || CENTRAL_PRODUCT_ID.test(item.productId) || known.has(item.productId)) {
        return item;
      }
      const { productId: _drop, ...rest } = item;
      return rest;
    }),
  };
}

export function createSharedListStore(pool: PoolLike, now: () => number = Date.now): SharedListStore {
  const totals: SharedListStats = { created: 0, hits: 0, expired: 0, missing: 0, purged: 0 };

  async function query(text: string, values?: unknown[]): Promise<Rows> {
    return pool.query(text, values);
  }

  return {
    async create(raw) {
      const sanitized = sanitizeSharedListResult(raw);
      if (!sanitized.ok) return { ok: false, code: sanitized.code };
      const list = await dropUnknownCatalogIds(sanitized.list, query);
      const hash = contentHashOf(list);
      const createdAt = new Date(now());
      const expiresAt = new Date(createdAt.getTime() + SHARED_LIST_TTL_MS);
      try {
        const id = newId();
        await query(`INSERT INTO shared_lists (id, content_hash, payload, created_at, expires_at) VALUES ($1, $2, $3::jsonb, $4, $5)`, [
          id,
          hash,
          JSON.stringify(list),
          createdAt.toISOString(),
          expiresAt.toISOString(),
        ]);
        totals.created += 1;
        return { ok: true, id, expiresAt: expiresAt.toISOString() };
      } catch {
        return { ok: false, code: "unavailable" };
      }
    },

    async get(id) {
      if (!isId(id)) {
        totals.missing += 1;
        return { ok: false, code: "invalid" };
      }
      try {
        const { rows } = await query(`SELECT payload, expires_at FROM shared_lists WHERE id = $1`, [id]);
        const row = rows[0];
        if (!row) {
          totals.missing += 1;
          return { ok: false, code: "missing" };
        }
        const expiresAt = row.expires_at instanceof Date ? row.expires_at.getTime() : Date.parse(String(row.expires_at));
        if (!Number.isFinite(expiresAt) || expiresAt <= now()) {
          totals.expired += 1;
          return { ok: false, code: "expired" };
        }
        const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
        const list = sanitizeSharedList(payload);
        if (!list) {
          totals.missing += 1;
          return { ok: false, code: "invalid" };
        }
        totals.hits += 1;
        return { ok: true, list };
      } catch {
        return { ok: false, code: "unavailable" };
      }
    },

    async purgeExpired() {
      try {
        const { rows } = await query(`DELETE FROM shared_lists WHERE expires_at <= $1 RETURNING id`, [new Date(now()).toISOString()]);
        const count = rows.length;
        totals.purged += count;
        return count;
      } catch {
        return 0;
      }
    },

    stats: () => ({ ...totals }),
  };
}

/** No-op store when Postgres is off: create/get always unavailable. */
export function disabledSharedListStore(): SharedListStore {
  const totals: SharedListStats = { created: 0, hits: 0, expired: 0, missing: 0, purged: 0 };
  return {
    async create() {
      return { ok: false, code: "unavailable" };
    },
    async get() {
      return { ok: false, code: "unavailable" };
    },
    async purgeExpired() {
      return 0;
    },
    stats: () => ({ ...totals }),
  };
}

export type { Queryable };
